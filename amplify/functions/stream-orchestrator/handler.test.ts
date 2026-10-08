import { beforeEach, expect, test, vi } from "vitest";

const sendMock = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/lib-dynamodb", async (init) => {
  const original = await init<typeof import("@aws-sdk/lib-dynamodb")>();
  return {
    ...original,
    DynamoDBDocumentClient: {
      from: () => ({ send: sendMock }),
    },
  };
});

import { updateSession } from "./handler";

beforeEach(() => {
  sendMock.mockReset();
});

test("updateSession enforces the expected status transition", async () => {
  sendMock.mockResolvedValueOnce({});

  const result = await updateSession(
    "SessionsTable",
    "session-1",
    "live",
    {},
    "starting"
  );

  expect(result).toBe(true);
  expect(sendMock.mock.calls[0]?.[0]?.input).toMatchObject({
    TableName: "SessionsTable",
    Key: { id: "session-1" },
    ConditionExpression: "#status = :expectedStatus",
    ExpressionAttributeValues: {
      ":status": "live",
      ":expectedStatus": "starting",
    },
  });
});

test("updateSession returns false when DynamoDB rejects the transition", async () => {
  sendMock.mockRejectedValueOnce({
    name: "ConditionalCheckFailedException",
  });

  const result = await updateSession(
    "SessionsTable",
    "session-1",
    "live",
    {},
    "starting"
  );

  expect(result).toBe(false);
});
