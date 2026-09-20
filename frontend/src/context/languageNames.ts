export function localizedName(uuid: string, englishName: string, names: Record<string, string>) {
  return names[uuid.toLowerCase()] || englishName;
}
