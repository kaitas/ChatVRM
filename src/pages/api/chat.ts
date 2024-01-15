import OpenAI from 'openai';
import type { NextApiRequest, NextApiResponse } from "next";

type Data = {
  message: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    res
      .status(400)
      .json({ message: "APIキーが間違っているか、設定されていません。" });
    return;
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: req.body.messages,
    });
    // response を chatCompletion に置き換える
    const message = chatCompletion.choices[0].message?.content || "エラーが発生しました";
    res.status(200).json({ message: message });
  } catch (error) {
    res.status(500).json({ message: `サーバーエラーが発生しました: ${error}` });
  }
}
