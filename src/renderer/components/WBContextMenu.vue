<!--
  WBContextMenu - Replacement for broken xel contextmenu component
  This is a working reimplementation of the xel toolkit's x-contextmenu component
  which has bugs in the library that prevent proper functionality.
-->
<template>
  <!-- Invisible trigger area that covers the parent element -->
  <div
    v-if="hasTrigger"
    ref="triggerRef"
    class="wb-contextmenu-trigger"
    @contextmenu.prevent="showMenu"
  ></div>

  <!-- Context menu popup -->
  <teleport to="body">
    <div
      v-if="isVisible"
      ref="menuRef"
      class="wb-contextmenu-menu"
      :style="menuStyle"
      @click.stop="handleMenuClick"
    >
      <slot></slot>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

interface Props {
  trigger?: 'contextmenu' | 'click' | 'none'
}

const props = withDefaults(defineProps<Props>(), {
  trigger: 'contextmenu'
})

const emit = defineEmits<{
  show: []
  hide: []
}>()

const contextMenuRef = ref<HTMLElement>()
const triggerRef = ref<HTMLElement>()
const menuRef = ref<HTMLElement>()

const isVisible = ref(false)
const menuPosition = ref({ x: 0, y: 0 })

const hasTrigger = computed(() => props.trigger !== 'none')

const menuStyle = computed(() => ({
  left: `${menuPosition.value.x}px`,
  top: `${menuPosition.value.y}px`
}))

const showMenu = (event: MouseEvent) => {
  if (props.trigger === 'none') return

  event.preventDefault()
  event.stopPropagation()

  // Position the menu slightly offset from the mouse cursor for better UX
  menuPosition.value.x = event.clientX + 2
  menuPosition.value.y = event.clientY + 2

  isVisible.value = true
  emit('show')

  // Close on next tick to allow menu to render
  nextTick(() => {
    adjustPosition()
    document.addEventListener('click', hideMenu)
    document.addEventListener('contextmenu', hideMenu)
    window.addEventListener('scroll', hideMenu)
    window.addEventListener('resize', hideMenu)
  })
}

const handleMenuClick = (event: MouseEvent) => {
  // Close menu when a menu item is clicked
  // The @click.stop on the menu div prevents this from firing on menu background clicks
  const target = event.target as HTMLElement
  if (target.closest('.wb-menuitem')) {
    hideMenu()
  }
}

const hideMenu = () => {
  isVisible.value = false
  emit('hide')

  document.removeEventListener('click', hideMenu)
  document.removeEventListener('contextmenu', hideMenu)
  window.removeEventListener('scroll', hideMenu)
  window.removeEventListener('resize', hideMenu)
}

const adjustPosition = () => {
  if (!menuRef.value) return

  const menuRect = menuRef.value.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // Adjust horizontal position if menu goes off screen
  if (menuPosition.value.x + menuRect.width > viewportWidth) {
    menuPosition.value.x = viewportWidth - menuRect.width - 10
  }

  // Adjust vertical position if menu goes off screen
  if (menuPosition.value.y + menuRect.height > viewportHeight) {
    menuPosition.value.y = viewportHeight - menuRect.height - 10
  }

  // Ensure minimum position
  menuPosition.value.x = Math.max(10, menuPosition.value.x)
  menuPosition.value.y = Math.max(10, menuPosition.value.y)
}

// Expose methods for programmatic control
defineExpose({
  show: showMenu,
  hide: hideMenu
})

onUnmounted(() => {
  hideMenu()
})
</script>

<style scoped>
.wb-contextmenu-trigger {
  position: absolute;
  inset: 0;
  z-index: 1;
  cursor: context-menu;
  pointer-events: auto;
}

.wb-contextmenu-menu {
  position: fixed;
  z-index: 9999;
  background: var(--x-menu-background, #ffffff);
  border: 1px solid var(--x-menu-border, #e0e0e0);
  border-radius: var(--x-menu-border-radius, 4px);
  box-shadow: var(--x-menu-shadow, 0 4px 12px rgba(0, 0, 0, 0.15));
  padding: var(--x-menu-padding, 4px 0);
  min-width: 120px;
  max-width: 300px;
  pointer-events: auto;
}

/* Dark theme support */
@media (prefers-color-scheme: dark) {
  .wb-contextmenu-menu {
    background: var(--x-menu-background-dark, #2a2a2a);
    border-color: var(--x-menu-border-dark, #404040);
    box-shadow: var(--x-menu-shadow-dark, 0 4px 12px rgba(0, 0, 0, 0.3));
  }
}

/* Match xel theming if available */
:global(.x-theme-material) .wb-contextmenu-menu {
  background: var(--x-surface-background, #ffffff);
  border-color: var(--x-outline-color, #e0e0e0);
  border-radius: var(--x-border-radius, 4px);
}

:global(.x-theme-material.x-theme-dark) .wb-contextmenu-menu {
  background: var(--x-surface-background, #1e1e1e);
  border-color: var(--x-outline-color, #404040);
}
</style>
