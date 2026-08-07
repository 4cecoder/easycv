import { pipeline, env, type PipelineType } from "@huggingface/transformers";

// Disable local models to fetch from the Hugging Face Hub
env.allowLocalModels = false;
env.useBrowserCache = true;

class PipelineSingleton {
  static task: PipelineType = "text-generation";
  static model: string = "Xenova/MiniCPM-5"; // Assuming this or similar is available; adjust as necessary
  static instance: any = null;

  static async getInstance(progress_callback?: (info: any) => void) {
    if (this.instance === null) {
      this.instance = pipeline(this.task, this.model, { progress_callback });
    }
    return this.instance;
  }
}

export async function extractTextWithMiniCPM(
  text: string,
  onProgress?: (info: any) => void
): Promise<string> {
  const generator = await PipelineSingleton.getInstance(onProgress);
  
  const result = await generator(text, {
    max_new_tokens: 256,
    temperature: 0.7,
    do_sample: true,
  });

  return result[0].generated_text;
}
