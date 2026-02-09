import { router } from "../router";

export function mouseBack(e: MouseEvent) {
    if (e.button === 3) router.back();
}

export function escBack(e: KeyboardEvent) {
    if (e.key === "Escape") router.back();
}

export function addNavigationEvents() {
    window.addEventListener("mouseup", mouseBack);
    window.addEventListener("keyup", escBack);
}

export function removeNavigationEvents() {
    window.removeEventListener("mouseup", mouseBack);
    window.removeEventListener("keyup", escBack);
}