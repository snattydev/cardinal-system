import { describe, expect, test } from "bun:test";
import { chatCompletionsUrl } from "./upstream";

describe("chatCompletionsUrl", () => {
  test("appends /v1/chat/completions when the base URL has no version prefix", () => {
    expect(chatCompletionsUrl("https://api.example")).toBe(
      "https://api.example/v1/chat/completions",
    );
  });

  test("does not double the /v1 segment and strips trailing slashes", () => {
    expect(chatCompletionsUrl("https://api.example/v1")).toBe(
      "https://api.example/v1/chat/completions",
    );
    expect(chatCompletionsUrl("https://api.example/v1/")).toBe(
      "https://api.example/v1/chat/completions",
    );
    expect(chatCompletionsUrl("https://api.example/openai/v1///")).toBe(
      "https://api.example/openai/v1/chat/completions",
    );
  });
});
