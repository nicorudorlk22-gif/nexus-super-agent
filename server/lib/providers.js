// NEXUS AI — Catálogo de provedores e modelos (server)
// Metadados honestos: "freeTier" descreve o que o provedor anuncia; o teste real
// de disponibilidade acontece com sua chave, via /api/models/test.

const CATALOG = [
  {
    id: "openrouter", name: "OpenRouter", kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    docs: "https://openrouter.ai/docs",
    freeTier: true, freeNote: "Oferece modelos com sufixo :free (limites diários variam; confira o painel).",
    models: [
      { id: "google/gemini-2.0-flash-exp:free", tag: "free", context: "~1M tokens (conforme o provedor)" },
      { id: "meta-llama/llama-3.1-8b-instruct:free", tag: "free", context: "128k" },
      { id: "mistralai/mistral-7b-instruct:free", tag: "free", context: "32k" },
      { id: "qwen/qwen-2.5-72b-instruct:free", tag: "free", context: "32k" },
      { id: "deepseek/deepseek-r1:free", tag: "free", context: "128k" }
    ]
  },
  {
    id: "nvidia", name: "NVIDIA NIM", kind: "openai",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    docs: "https://build.nvidia.com",
    freeTier: true, freeNote: "Créditos de avaliação para contas novas; depois é pago por token.",
    models: [
      { id: "meta/llama-3.1-8b-instruct", tag: "paid" },
      { id: "nvidia/llama-3.1-nemotron-70b-instruct", tag: "paid" },
      { id: "qwen/qwen2.5-coder-32b-instruct", tag: "paid" },
      { id: "deepseek-ai/deepseek-r1", tag: "paid" }
    ]
  },
  {
    id: "gemini", name: "Google Gemini", kind: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    docs: "https://aistudio.google.com",
    freeTier: true, freeNote: "Camada gratuita com limites por minuto/dia no AI Studio.",
    models: [
      { id: "gemini-2.0-flash", tag: "free" },
      { id: "gemini-2.5-flash", tag: "free" },
      { id: "gemini-2.5-pro", tag: "paid" }
    ]
  },
  {
    id: "groq", name: "Groq", kind: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    docs: "https://console.groq.com",
    freeTier: true, freeNote: "Camada gratuita com limites por minuto/dia.",
    models: [
      { id: "llama-3.1-8b-instant", tag: "free" },
      { id: "llama-3.3-70b-versatile", tag: "free" },
      { id: "qwen/qwen3-32b", tag: "free" }
    ]
  },
  {
    id: "cerebras", name: "Cerebras", kind: "openai",
    baseUrl: "https://api.cerebras.ai/v1",
    docs: "https://cloud.cerebras.ai",
    freeTier: true, freeNote: "Camada gratuita com limites diários.",
    models: [
      { id: "llama3.1-8b", tag: "free" },
      { id: "llama-3.3-70b", tag: "free" }
    ]
  },
  {
    id: "minimax", name: "MiniMax", kind: "openai",
    baseUrl: "https://api.minimax.chat/v1",
    docs: "https://platform.minimaxi.com",
    freeTier: false, freeNote: "Créditos de avaliação para contas novas.",
    models: [{ id: "abab6.5s-chat", tag: "paid" }, { id: "MiniMax-Text-01", tag: "paid" }]
  },
  {
    id: "deepseek", name: "DeepSeek API", kind: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    docs: "https://platform.deepseek.com",
    freeTier: false, freeNote: "Preço baixo por token; sem camada gratuita permanente.",
    models: [{ id: "deepseek-chat", tag: "paid" }, { id: "deepseek-reasoner", tag: "paid" }]
  },
  {
    id: "mistral", name: "Mistral API", kind: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    docs: "https://console.mistral.ai",
    freeTier: true, freeNote: "Camada gratuita com limites no La Plateforme.",
    models: [{ id: "mistral-small-latest", tag: "free" }, { id: "codestral-latest", tag: "paid" }]
  },
  {
    id: "together", name: "Together AI", kind: "openai",
    baseUrl: "https://api.together.xyz/v1",
    docs: "https://api.together.ai",
    freeTier: false, freeNote: "Créditos de avaliação; depois pago por token.",
    models: [{ id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", tag: "paid" }]
  },
  {
    id: "fireworks", name: "Fireworks AI", kind: "openai",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    docs: "https://fireworks.ai",
    freeTier: false, freeNote: "Créditos de avaliação; depois pago por token.",
    models: [{ id: "accounts/fireworks/models/llama-v3p3-70b-instruct", tag: "paid" }]
  },
  {
    id: "openai", name: "OpenAI API", kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    docs: "https://platform.openai.com",
    freeTier: false, freeNote: "Pago por token.",
    models: [{ id: "gpt-4o-mini", tag: "paid" }, { id: "gpt-4o", tag: "paid" }]
  },
  {
    id: "anthropic", name: "Anthropic API", kind: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    docs: "https://console.anthropic.com",
    freeTier: false, freeNote: "Pago por token.",
    models: [{ id: "claude-sonnet-4-5", tag: "paid" }]
  },
  {
    id: "huggingface", name: "Hugging Face Inference", kind: "openai",
    baseUrl: "https://router.huggingface.co/v1",
    docs: "https://huggingface.co/inference-providers",
    freeTier: true, freeNote: "Créditos mensais pequenos de inferência.",
    models: [{ id: "meta-llama/Llama-3.1-8B-Instruct", tag: "free" }]
  },
  {
    id: "ollama", name: "Ollama (local)", kind: "openai",
    baseUrl: "http://127.0.0.1:11434/v1",
    docs: "https://ollama.com",
    freeTier: true, local: true,
    freeNote: "Roda na sua máquina: qwen, deepseek, llama, gemma, mistral, phi, glm, minicpm, starcoder.",
    models: [
      { id: "qwen2.5-coder:7b", tag: "local" },
      { id: "deepseek-coder-v2", tag: "local" },
      { id: "llama3.1:8b", tag: "local" },
      { id: "gemma2:9b", tag: "local" },
      { id: "mistral", tag: "local" },
      { id: "phi3.5", tag: "local" }
    ]
  }
];

function provider(id) { return CATALOG.find(p => p.id === id) || null; }

module.exports = { CATALOG, provider };
