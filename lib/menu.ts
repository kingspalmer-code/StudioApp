// Menu buttons that can't be switched off on computers (Settings > Menu): the first one, and
// Settings itself, so the switches are never out of reach.
export const alwaysOnComputer = (href: string, i: number) => i === 0 || href === "/settings";
