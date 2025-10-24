// auto-scroll.ts
import type { Directive, DirectiveBinding } from "vue";

interface ScrollOptions {
    behavior?: ScrollBehavior;
    top?: number;
    left?: number;
}

interface AutoScrollElement extends HTMLElement {
    _autoScrollObserver?: MutationObserver;
}

export const autoScroll: Directive<AutoScrollElement, ScrollOptions> = {
    mounted(el: AutoScrollElement, binding: DirectiveBinding<ScrollOptions>) {
        // Store the mutation observer instance on the element
        el._autoScrollObserver = new MutationObserver(() => {
            // Get scroll options from binding value or use defaults
            const options: ScrollOptions = {
                behavior: "smooth",
                ...binding.value,
            };

            // Scroll to bottom
            el.scrollTo({
                top: el.scrollHeight,
                ...options,
            });
        });

        // Configure the observer to watch for changes
        const config: MutationObserverInit = {
            childList: true, // Watch for changes in child elements
            subtree: true, // Watch all descendants, not just direct children
            characterData: true, // Watch for changes in text content
        };

        // Start observing
        el._autoScrollObserver.observe(el, config);

        // Initial scroll
        el.scrollTo({
            top: el.scrollHeight,
            behavior: binding.value?.behavior ?? "smooth",
        });
    },

    beforeUnmount(el: AutoScrollElement): void {
        // Clean up the observer when directive is removed
        if (el._autoScrollObserver) {
            el._autoScrollObserver.disconnect();
            delete el._autoScrollObserver;
        }
    },

    // Re-apply when component updates
    updated(el: AutoScrollElement, binding: DirectiveBinding<ScrollOptions>): void {
        const options: ScrollOptions = {
            behavior: "smooth",
            ...binding.value,
        };

        el.scrollTo({
            top: el.scrollHeight,
            ...options,
        });
    },
};
