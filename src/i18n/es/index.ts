import { settings } from "./settings";
import { notch } from "./notch";
import { dock } from "./dock";

/** Spanish entries, split by window so each area's strings live together. */
export const es: Record<string, string> = {
	...settings,
	...notch,
	...dock
};
