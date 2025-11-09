import { addCollection } from "@iconify/vue";
import { type IconifyIcons } from "@iconify/types";

/**
 * Creates custom Iconify collection `winboat`, adding every custom icon used.
 *
 * You can specify extra icons as well, but do keep in mind that you can do so once, when the built-in icons are added as well (as per {@link addCollection}'s functionality)
 */
export function addWinBoatIconCollection(extraIcons?: IconifyIcons) {
    // For specifying built-in icons
    const icons = {
        ...extraIcons,
    };

    addCollection({
        prefix: "winboat",
        icons,
    });
}
