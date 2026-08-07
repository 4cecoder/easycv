import { pipeline, env, type PipelineType } from "@huggingface/transformers";

// Disable local models to fetch from the Hugging Face Hub
env.allowLocalModels = false;
env.useBrowserCache = true;

const SYSTEM_PROMPT = "You are a specialized data extraction assistant. Extract the requested information accurately.";
const MAX_INPUT_LENGTH = 2000;

export class PipelineSingleton {
  static task: PipelineType = "text-generation";
  static model: string = "Xenova/MiniCPM-5";
  static instance: any = null;

  static async getInstance(progress_callback?: (info: any) => void) {
    if (this.instance === null) {
      this.instance = pipeline(this.task, this.model, { progress_callback });
    }
    return this.instance;
  }
}

export function formatMiniCPMPrompt(text: string): string {
  const truncated = text.slice(0, MAX_INPUT_LENGTH);
  return `<|system|>\n${SYSTEM_PROMPT}\n<|user|>\n${truncated}\n<|assistant|>\n`;
}

export async function extractTextWithMiniCPM(
  text: string,
  onProgress?: (info: any) => void
): Promise<string> {
  if (!text || text.trim() === "") {
    return "";
  }

  try {
    const generator = await PipelineSingleton.getInstance(onProgress);
    const prompt = formatMiniCPMPrompt(text);
    
    const result = await generator(prompt, {
      max_new_tokens: 512,
      temperature: 0.1,
      do_sample: true,
    });

    if (result && result.length > 0 && result[0].generated_text) {
      const generated = result[0].generated_text;
      if (generated.startsWith(prompt)) {
        return generated.slice(prompt.length).trim();
      }
      return generated.trim();
    }
    return "";
  } catch (error) {
    console.error("Extraction failed:", error);
    return "Fallback: Could not extract data.";
  }
}
