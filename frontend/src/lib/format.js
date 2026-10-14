// Targets accumulate by repeated float addition, so trim display noise
// (e.g. 22.200000000000003) without showing a pointless ".0" on whole numbers.
export const formatWeight = (kg) => Number(kg.toFixed(2)).toString();
