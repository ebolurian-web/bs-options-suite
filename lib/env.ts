const required = (name: string, value: string | undefined): string => {
  if (!value || value.length === 0) {
    throw new Error(`Missing required env var: ${name}. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
};

const optional = (value: string | undefined): string | null =>
  value && value.length > 0 ? value : null;

export const env = {
  polygonApiKey: () => required("POLYGON_API_KEY", process.env.POLYGON_API_KEY),
  marketdataToken: () => optional(process.env.MARKETDATA_API_TOKEN),
  liveDataEnabled: () => process.env.NEXT_PUBLIC_ENABLE_LIVE_DATA !== "false",
};
