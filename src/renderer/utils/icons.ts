import { addCollection } from '@iconify/vue';

/**
 * Creates custom Iconify collection `winboat`, adding every custom icon used.
 */
export function addWinBoatIcons() {
    addCollection({
        prefix: "winboat",
        icons: {
            "remote-desktop": {
                body: `<path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="14" d="M96 170c40.869 0 74-33.131 74-74 0-40.87-33.131-74-74-74-40.87 0-74 33.13-74 74 0 40.869 33.13 74 74 74Z"/><path stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="14" d="M126 52 98 80l28 28M66 84l28 28-28 28"/>`,
                width: 192,
                height: 192  
            }
        }
    });
}