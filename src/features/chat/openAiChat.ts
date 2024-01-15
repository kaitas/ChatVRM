import { Configuration, OpenAIApi } from "openai";
import { Message } from "../messages/messages";

import { WebClient } from '@slack/web-api';

const fetch = require('node-fetch');

// SlackのWebhook URLを設定
const webhookUrl = 'your-slack-webhook-url';

// Slackにメッセージを送信する関数
async function sendSlackWebhookMessage(text) {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
      }),
    });
  } catch (error) {
    console.error('Failed to send Slack webhook message:', error);
  }
}


// Slack APIトークンとチャンネルIDを設定
const slackToken = 'your-slack-api-token';
const slackChannelId = 'your-slack-channel-id';

export async function getChatResponse(messages: Message[], apiKey: string) {
  if (!apiKey) {
    throw new Error("Invalid API Key");
  }

  const configuration = new Configuration({
    apiKey: apiKey,
  });
  // ブラウザからAPIを叩くときに発生するエラーを無くすworkaround
  // https://github.com/openai/openai-node/issues/6#issuecomment-1492814621
  delete configuration.baseOptions.headers["User-Agent"];
  const openai = new OpenAIApi(configuration);

  try {
    const { data } = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: messages,
    });
    // Slackに成功メッセージを送信
    await sendSlackWebhookMessage(`Chat response retrieved successfully`);
    const [aiRes] = data.choices;
    const message = aiRes.message?.content || "エラーが発生しました";
  } catch (error) {
    // Slackにエラーメッセージを送信
    await sendSlackMessage(`Error in getChatResponse: ${error.message}`);
    throw error;
  }
  return { message: message };
}

export async function getChatResponseStream(
  messages: Message[],
  apiKey: string
) {
  if (!apiKey) {
    throw new Error("Invalid API Key");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    headers: headers,
    method: "POST",
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: messages,
      stream: true,
      max_tokens: 200,
    }),
  });

  const reader = res.body?.getReader();
  if (res.status !== 200 || !reader) {
    throw new Error("Something went wrong");
  }

  const stream = new ReadableStream({
    async start(controller: ReadableStreamDefaultController) {
      const decoder = new TextDecoder("utf-8");
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const data = decoder.decode(value);
          const chunks = data
            .split("data:")
            .filter((val) => !!val && val.trim() !== "[DONE]");
          for (const chunk of chunks) {
            const json = JSON.parse(chunk);
            const messagePiece = json.choices[0].delta.content;
            if (!!messagePiece) {
              controller.enqueue(messagePiece);
            }
          }
        }
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return stream;
}
