/** Adds utm_* params so group traffic is attributable. */
export function withGroupUtm(url: string, campaign: string): string {
  try {
    const u = new URL(url)
    u.searchParams.set("utm_source", "facebook")
    u.searchParams.set("utm_medium", "group_post")
    u.searchParams.set("utm_campaign", campaign)
    return u.toString()
  } catch {
    return url
  }
}

type PostLine = string | null | undefined | false

/** Joins sections of lines into a post body: empty lines are dropped, sections are separated by a blank line. */
export function joinPostLines(...sections: PostLine[][]): string {
  return sections
    .map((lines) => lines.filter((line): line is string => Boolean(line && line.trim())).join("\n"))
    .filter(Boolean)
    .join("\n\n")
}
