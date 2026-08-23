const parseCudaVersion = (value) => {
  const match = String(value || "").match(/([0-9]+)\.([0-9]+)/);
  return match ? Number(`${match[1]}.${match[2]}`) : 0;
};

export const selectWindowsTorchVariant = (cudaVersion) => {
  const supported = parseCudaVersion(cudaVersion);
  if (supported >= 13) return "cu130";
  if (supported >= 12.8) return "cu128";
  if (supported >= 12.6) return "cu126";
  return "cu124";
};

export const buildWindowsTorchIndex = (cudaVersion) =>
  `https://download.pytorch.org/whl/${selectWindowsTorchVariant(cudaVersion)}`;
