import OpenAI from 'openai';
//https://stackoverflow.com/questions/76917525/openai-api-error-module-openai-has-no-exported-member-configuration
//import { Configuration, OpenAIApi } from "openai";
import { Message } from "../messages/messages";
// .env ファイルから環境変数を読み込む
import 'isomorphic-fetch';

// Slackにメッセージを送信する関数
async function sendSlackWebhookMessage(text: string) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('Slack webhook URL is not defined');
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });
  } catch (error) {
    console.error('Failed to send Slack webhook message:', error);
  }
}

interface ChatResponse {
  message: string;
}

export async function getChatResponse(messages: Message[]): Promise<ChatResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Invalid API Key");
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  let message = "エラーが発生しました"; // デフォルトメッセージを設定

  try {
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
    });
    // Slackに成功メッセージを送信
    await sendSlackWebhookMessage(`Chat response retrieved successfully`);
    const [aiRes] = chatCompletion.choices;
    if (aiRes.message?.content) {
      message = aiRes.message.content;
    }
  } catch (error) {
    // エラーが Error インスタンスであるか確認
    if (error instanceof Error) {
    // Slackにエラーメッセージを送信
      await sendSlackWebhookMessage(`Error in getChatResponse: ${error.message}`);
    } else {
      // error が Error インスタンスでない場合の処理
      await sendSlackWebhookMessage(`Error in getChatResponse: An unknown error occurred`);
    }
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
