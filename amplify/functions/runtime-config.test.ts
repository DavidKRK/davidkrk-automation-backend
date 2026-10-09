import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getOptionalWebhookUrl,
  getRequiredEnv,
  isLikelyPlaceholder,
  requireConnectorWebhookSecret,
  requireSecret,
  validateHttpUrl,
} from "./runtime-config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getRequiredEnv", () => {
  it.each([undefined, "", "   "])("rejects missing or blank values (%s)", (value) => {
    if (value === undefined) {
      delete process.env.RUNTIME_TEST_VALUE;
    } else {
      vi.stubEnv("RUNTIME_TEST_VALUE", value);
    }

    expect(() => getRequiredEnv("RUNTIME_TEST_VALUE")).toThrow(/Missing required/);
  });

  it.each(["replace-me", "example.com", "your-secret", "test"])(
    "rejects placeholder values (%s)",
    (value) => {
      vi.stubEnv("RUNTIME_TEST_VALUE", value);
      expect(() => getRequiredEnv("RUNTIME_TEST_VALUE")).toThrow(/placeholder/);
      expect(isLikelyPlaceholder(value)).toBe(true);
    }
  );

  it.each(["company-sample-table", "api.examplecorp.com"])(
    "accepts legitimate values containing placeholder-like words (%s)",
    (value) => {
      vi.stubEnv("RUNTIME_TEST_VALUE", value);
      expect(getRequiredEnv("RUNTIME_TEST_VALUE")).toBe(value);
      expect(isLikelyPlaceholder(value)).toBe(false);
    }
  );

  it("trims and returns a configured value", () => {
    vi.stubEnv("RUNTIME_TEST_VALUE", "  a-real-config-value  ");
    expect(getRequiredEnv("RUNTIME_TEST_VALUE")).toBe("a-real-config-value");
  });
});

describe("requireSecret", () => {
  it("enforces the minimum length even when NODE_ENV is test", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RUNTIME_TEST_SECRET", "x".repeat(11));
    expect(() => requireSecret("RUNTIME_TEST_SECRET")).toThrow(/too short/);
  });

  it.each([12, 13])("accepts secrets at or above the minimum length (%i)", (length) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RUNTIME_TEST_SECRET", "x".repeat(length));
    expect(requireSecret("RUNTIME_TEST_SECRET")).toBe("x".repeat(length));
  });

  it("rejects secrets shorter than the minimum length in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RUNTIME_TEST_SECRET", "x".repeat(11));
    expect(() => requireSecret("RUNTIME_TEST_SECRET")).toThrow(/too short/);
  });

  it("applies the same minimum-length policy in test and production", () => {
    for (const nodeEnv of ["test", "production"]) {
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("RUNTIME_TEST_SECRET", "x".repeat(11));
      expect(() => requireSecret("RUNTIME_TEST_SECRET")).toThrow(/too short/);
    }
  });
});

describe("requireConnectorWebhookSecret", () => {
  it("accepts a canonical base64 secret representing 32 bytes", () => {
    const secret = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
    vi.stubEnv("RUNTIME_TEST_WEBHOOK_SECRET", secret);
    expect(requireConnectorWebhookSecret("RUNTIME_TEST_WEBHOOK_SECRET")).toBe(secret);
  });

  it.each(["x".repeat(44), `${"A".repeat(43)}=`, `${"B".repeat(43)}=`])(
    "rejects weak or non-canonical webhook keys",
    (secret) => {
      vi.stubEnv("RUNTIME_TEST_WEBHOOK_SECRET", secret);
      expect(() => requireConnectorWebhookSecret("RUNTIME_TEST_WEBHOOK_SECRET")).toThrow(/32 bytes/);
    }
  );
});

describe("webhook URL validation", () => {
  it("allows an optional unset endpoint", () => {
    expect(getOptionalWebhookUrl("RUNTIME_TEST_WEBHOOK", {} as NodeJS.ProcessEnv)).toBeUndefined();
  });

  it("rejects malformed and placeholder endpoint values", () => {
    expect(() =>
      getOptionalWebhookUrl("RUNTIME_TEST_WEBHOOK", {
        RUNTIME_TEST_WEBHOOK: "not a url",
      } as NodeJS.ProcessEnv)
    ).toThrow(/invalid webhook URL/);
    expect(() =>
      getOptionalWebhookUrl("RUNTIME_TEST_WEBHOOK", {
        RUNTIME_TEST_WEBHOOK: "https://example.com/hook",
      } as NodeJS.ProcessEnv)
    ).toThrow(/placeholder/);
    expect(() =>
      getOptionalWebhookUrl("RUNTIME_TEST_WEBHOOK", {
        RUNTIME_TEST_WEBHOOK: "https://api.example.com/hook",
        AMPLIFY_ENV: "sandbox",
      } as NodeJS.ProcessEnv)
    ).toThrow(/placeholder/);
  });

  it("accepts real hosts containing the word example", () => {
    expect(
      getOptionalWebhookUrl("RUNTIME_TEST_WEBHOOK", {
        RUNTIME_TEST_WEBHOOK: "https://api.examplecorp.com/hook",
        AMPLIFY_ENV: "sandbox",
      } as NodeJS.ProcessEnv)
    ).toBe("https://api.examplecorp.com/hook");
  });

  it("allows HTTP in development and requires HTTPS in production", () => {
    expect(
      getOptionalWebhookUrl("RUNTIME_TEST_WEBHOOK", {
        RUNTIME_TEST_WEBHOOK: "http://localhost:3000/hook",
        AMPLIFY_ENV: "sandbox",
      } as NodeJS.ProcessEnv)
    ).toBe("http://localhost:3000/hook");

    expect(() =>
      validateHttpUrl("http://webhook.example.org/hook", {
        AWS_BRANCH: "main",
      } as NodeJS.ProcessEnv)
    ).toThrow(/HTTPS/);
    expect(() =>
      validateHttpUrl("https://webhook.example.org/hook", {
        NODE_ENV: "production",
      } as NodeJS.ProcessEnv)
    ).toThrow(/HTTPS/);
    expect(
      validateHttpUrl("https://webhook.examplecorp.com/hook", {
        NODE_ENV: "production",
      } as NodeJS.ProcessEnv)
    ).toBe("https://webhook.examplecorp.com/hook");
  });

  it("requires HTTPS in production identified by the synthesized connector branch", () => {
    expect(() =>
      validateHttpUrl("http://webhook.internal/hook", {
        CONNECTOR_DEPLOYMENT_BRANCH: "main",
      } as NodeJS.ProcessEnv)
    ).toThrow(/HTTPS/);
  });

  it("requires HTTPS when deployment environment metadata is missing", () => {
    expect(() => validateHttpUrl("http://webhook.test/hook", {} as NodeJS.ProcessEnv)).toThrow(
      /HTTPS/
    );
  });

  it("rejects credentials embedded in webhook URLs", () => {
    expect(() =>
      validateHttpUrl("https://user@webhook.test/hook", {
        AMPLIFY_ENV: "sandbox",
      } as NodeJS.ProcessEnv)
    ).toThrow(/valid HTTP or HTTPS URL/);
  });
});
