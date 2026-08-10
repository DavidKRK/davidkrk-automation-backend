import type { Handler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { getConnector } from "./connectors";
import type {
  ConnectorResult,
  StreamDestinationRecord,
  StreamSessionRecord,
} from "./connectors/types";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseDestinationIds(raw: string | undefined): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
    return [];
  } catch {
    return [];
  }
}

function shouldStartSession(session: StreamSessionRecord): boolean {
  if (!session.plannedStartAt) return true;
  return new Date(session.plannedStartAt).getTime() <= Date.now();
}

function shouldStopSession(session: StreamSessionRecord): boolean {
  if (!session.plannedEndAt) return false;
  return new Date(session.plannedEndAt).getTime() <= Date.now();
}

async function listSessions(tableName: string): Promise<StreamSessionRecord[]> {
  const result = await dynamo.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: "#status IN (:pending, :starting, :live, :ending)",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":pending": "pending",
        ":starting": "starting",
        ":live": "live",
        ":ending": "ending",
      },
    })
  );

  return (result.Items as StreamSessionRecord[] | undefined) ?? [];
}

async function listDestinations(tableName: string): Promise<StreamDestinationRecord[]> {
  const result = await dynamo.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: "enabled = :enabled",
      ExpressionAttributeValues: {
        ":enabled": true,
      },
    })
  );

  return (result.Items as StreamDestinationRecord[] | undefined) ?? [];
}

async function updateSession(
  tableName: string,
  sessionId: string,
  status: string,
  results: Record<string, ConnectorResult>,
  lastError?: string,
  markStarted = false,
  markEnded = false
): Promise<void> {
  const now = new Date().toISOString();

  await dynamo.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { id: sessionId },
      UpdateExpression:
        "SET #status = :status, resultsJson = :results, lastError = :lastError, updatedAt = :now"
        + (markStarted ? ", startedAt = :now" : "")
        + (markEnded ? ", endedAt = :now" : ""),
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": status,
        ":results": JSON.stringify(results),
        ":lastError": lastError ?? null,
        ":now": now,
      },
    })
  );
}

async function runPhase(
  phase: "prepareLive" | "startLive" | "stopLive",
  session: StreamSessionRecord,
  destinations: StreamDestinationRecord[]
): Promise<{ results: Record<string, ConnectorResult>; failures: string[] }> {
  const results: Record<string, ConnectorResult> = {};
  const failures: string[] = [];

  for (const destination of destinations) {
    const connector = getConnector(destination.platform);

    if (!connector) {
      const message = `Unsupported platform: ${destination.platform}`;
      results[destination.id] = { success: false, message };
      failures.push(`${destination.platform}: ${message}`);
      continue;
    }

    const result = await connector[phase](session, destination);
    results[destination.id] = result;

    if (!result.success) {
      failures.push(`${destination.platform}: ${result.message}`);
    }
  }

  return { results, failures };
}

export const handler: Handler = async () => {
  const sessionTableName = getRequiredEnv("STREAM_SESSION_TABLE_NAME");
  const destinationTableName = getRequiredEnv("STREAM_DESTINATION_TABLE_NAME");

  const sessions = await listSessions(sessionTableName);
  const destinations = await listDestinations(destinationTableName);
  const destinationsById = new Map(destinations.map((destination) => [destination.id, destination]));

  for (const session of sessions) {
    const destinationIds = parseDestinationIds(session.destinationsJson);
    const selectedDestinations = (destinationIds.length > 0
      ? destinationIds
          .map((destinationId) => destinationsById.get(destinationId))
          .filter((destination): destination is StreamDestinationRecord => Boolean(destination))
      : destinations
    ).filter((destination) => destination.status !== "disabled");

    if (selectedDestinations.length === 0) {
      await updateSession(
        sessionTableName,
        session.id,
        "failed",
        {},
        "No enabled stream destinations available"
      );
      continue;
    }

    if (session.status === "pending") {
      if (!shouldStartSession(session)) {
        continue;
      }

      const { results, failures } = await runPhase("prepareLive", session, selectedDestinations);
      await updateSession(
        sessionTableName,
        session.id,
        failures.length > 0 ? "failed" : "starting",
        results,
        failures[0]
      );
      continue;
    }

    if (session.status === "starting") {
      const { results, failures } = await runPhase("startLive", session, selectedDestinations);
      await updateSession(
        sessionTableName,
        session.id,
        failures.length > 0 ? "failed" : "live",
        results,
        failures[0],
        failures.length === 0,
        false
      );
      continue;
    }

    if (session.status === "live" && shouldStopSession(session)) {
      await updateSession(sessionTableName, session.id, "ending", {}, undefined, false, false);
      continue;
    }

    if (session.status === "ending") {
      const { results, failures } = await runPhase("stopLive", session, selectedDestinations);
      await updateSession(
        sessionTableName,
        session.id,
        failures.length > 0 ? "failed" : "ended",
        results,
        failures[0],
        false,
        failures.length === 0
      );
    }
  }

  return {
    statusCode: 200,
    body: `Processed ${sessions.length} session(s).`,
  };
};
