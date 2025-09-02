
# CHANGELOG

## 0.36.2 (2025-07-28)

- [Fixed] `<x-menubar>` fails to update correctly on Firefox when using `slot="aside"`

## 0.36.1 (2025-07-16)

- [Fixed] `<x-icon>` does not render shapes with gradient fill

## 0.36.0 (2025-07-12)

- Add `aside` named slot to `<x-menubar>`
- Switch to "Midline Horizontal Ellipsis" char for `<x-menubar>` ellipsis
- [Fixed] `<x-menubar>` layout fails to update when changing locales

## 0.35.2 (2025-06-22)

- [Fixed] `<x-contextmenu>` stops some pointer events from firing when using touch input method

## 0.35.1 (2025-06-21)

- [Fixed] `event.isPrimary` is not preserved when firing synthesized `lostpointercapture` event

## 0.35.0 (2025-06-17)

- Add `Xel.configStorage` property

## 0.34.7 (2025-06-13)

- Increase the interval time between subsequent menubar updates

## 0.34.6 (2025-06-12)

- [Fixed] Material theme subthemes have incorrect colors unless the subtheme file name starts with "material"

## 0.34.5 (2025-06-09)

- [Fixed] `<x-menubar>` fails to update in some edge cases

## 0.34.4 (2025-06-02)

- [Fixed] `<x-menubar>` ellipsis might overflow the window bounds

## 0.34.3 (2025-06-02)

- [Fixed] `<x-colorpicker>` fails to update on initial document load

## 0.34.2 (2025-05-28)

- [Fixed] `<x-menubar>` fails to update in some edge cases

## 0.34.1 (2025-05-28)

- [Fixed] Error thrown when updating `<x-menubar>` with no children

## 0.34.0 (2025-05-28)

- Show ellipsis when top level menubar items can't be fitted on the screen
- [Fixed] `<x-menubar>` children without submenus should behave like buttons

## 0.33.13 (2025-05-13)

- [Fixed] Menu item labels are cut off on Linux

## 0.33.12 (2025-05-04)

- Don't include packaging scripts in the NPM package

## 0.33.11 (2025-05-04)

- Refactor packaging scripts

## 0.33.10 (2025-04-15)

- [Fixed] `<dialog>` element permanently overrides the `overflow` inline style on `<html>` and `<body>`

## 0.33.9 (2025-04-11)

- Show ellipsis when `<x-numberinput>` value overflow the visible area

## 0.33.8 (2025-03-31)

- [Fixed] Error thrown when attempting to close a disconnected `<x-contextmenu>`

## 0.33.7 (2025-03-22)

- [Fixed] `<x-drawer>` has wrong position on Firefox and Safari
- [Fixed] Can't expand menus when using touch input method

## 0.33.6 (2025-03-21)

- Highlight top level menu item when its descendant was triggered programmatically
- [Fixed] `<x-slider>` has incorrect width on WebKit-based browsers

## 0.33.5 (2025-03-19)

- [Fixed] Titlebar color is not properly updated when changing the accent color of Material themes

## 0.33.4 (2025-03-19)

- Simplify slider stylings in Material themes
- [Fixed] Material themes don't allow gray accent color

## 0.33.3 (2025-03-15)

- [Fixed] `<x-select>` has wrong z-index in some edge cases
- [Fixed] Error throw when connecting some elements directly to ShadowRoot
- [Fixed] Scrollbars are not styled on Firefox
- [Fixed] Color picker popover changes position when switching between tabs on WebKit-based web browsers
- [Fixed] Error thrown when `<x-numberinput>` loses focus
- [Fixed] Current text selection should be cleared when `<x-texteditor>` loses focus

## 0.33.2 (2025-03-06)

- Change font size units from "px" to "rem"
- [Fixed] `<x-tagsinput>` padding changes when entering values

## 0.33.1 (2025-03-03)

- [Fixed] Nested CSS rules are crashing Safari 18.3

## 0.33.0 (2025-03-02)

- Add `ticks` property to `<x-slider>`
- Support setting `border-radius` on `<table>` elements
- [Fixed] Text selection contrast is too low (Fluent Dark theme)
- [Fixed] `<x-stepper>` inside `<x-numberinput>` is too large (Fluent themes)
- [Fixed] `<x-drawer>` background is white instead of black (Fluent Dark theme)
- [Fixed] `<x-numberinput>` placeholder text has wrong color (Adwaita Dark theme)

## 0.32.2 (2025-02-27)

- [Fixed] `<x-nav>` dispatches the "toggle" event too early
- [Fixed] Can't hide `<x-navitem>` elements
- [Fixed] `<x-pager>.href` does not preserve URL search params
- [Fixed] `<x-pager>` with only a single page should be hidden

## 0.32.1 (2025-02-19)

- [Fixed] Minified themes are missing some stylings

## 0.32.0 (2025-02-19)

- Add `level` property to `<x-label>`
- Add special stylings for `<footer>` inside `<x-card>`
- Add special stylings for `<footer>` inside `<x-popover>`
- Use Adwaita Sans (Inter) instead of Cantarell fonts
- [Fixed] Accordion arrow is not updated when `<header>` element height changes
- [Changed API] Set padding directly on `<x-card>` rather than on its child `<main>` element
- [Changed API] Set padding directly on `<x-popover>` rather than on its child `<main>` element
- [Changed API] Set padding directly on `<dialog>` rather than on its child `<main>` element
- [Changed API] Don't require `<x-accordion>` to have child `<main>` element to be expandable
- [Changed API] Rename "graphite" preset accent color to "gray"
- [Changed API] Rename "default" button skin to "normal"
- [Changed API] Changed the default value of "size" property on `<x-button>` to "normal"

## 0.31.0 (2025-02-15)

- Material and Material Dark themes
- Add `position` property to `<x-drawer>`
- Add `maximized` property to `<x-titlebar>`
- [Fixed] Scroll offset is not preserved when reloading the demo website
- [Changed API] Remove `vertical` property from `<x-slider>`
- [Changed API] Remove `buffer` property from `<x-slider>`

## 0.30.0 (2025-02-05)

- Add `<x-titlebar>` element
- Add `<x-pager>` element
- Add `<x-avatar>` element
- Add `<x-drawer>` element
- [Changed API] Remove support for manual positioning of `<dialog>` elements

## 0.29.0 (2025-02-02)

- Update Fluent theme to match the latest Windows 11 UI guidelines
- Allow wide gamut accent color
- Add `<x-nav>` and `<x-navitem>`
- [Changed API] Rename `selected` property on `<x-tab>` to `toggled`
- [Changed API] Remove `condensed` property from `<x-numberinput>`
- [Changed API] Remove `type` property from `<x-throbber>`
- [Changed API] Remove `circular` and `nav` skins from `<x-button>`

## 0.28.17 (2025-01-01)

- [Fixed] Tooltip position is not updated when dynamically changing the tooltip text

## 0.28.16 (2024-11-14)

- [Fixed] Can't dismiss `<x-tooltip>` after disconnecting and reconnecting the ancestor element

## 0.28.15 (2024-10-26)

- Stop keyboard event propagation when deleting a tag inside `<x-tagsinput>` with backspace key

## 0.28.14 (2024-10-23)

- Make `<x-tagsinput>` look consistent with `<x-input>`

## 0.28.13 (2024-09-24)

- Treat `<x-notification>` with negative timeout value as permanent

## 0.28.12 (2024-09-08)

- Allow `<x-tooltip>` to be placed inside `<x-icon>`

## 0.28.11 (2024-09-08)

- [Fixed] Allow "unknown" selector in Fluent localization files

## 0.28.10 (2024-09-01)

- [Fixed] "none" is turned into null instead of NaN in dev version of colorjs.io

## 0.28.9 (2024-08-28)

- [Fixed] Breaking changes in the dev version of colorjs.io

## 0.28.8 (2024-08-23)

- [Fixed] `<x-checkbox>` fails to update on WebKit in some edge cases

## 0.28.7 (2024-08-15)

- Allow `<x-tooltip>` to be placed inside `<x-checkbox>`

## 0.28.6 (2024-07-29)

- [Fixed] Incorrect cursor position after changing `<x-texteditor>` value

## 0.28.5 (2024-06-30)

- [Fixed] Disabled `<x-numberinput>` is still editable

## 0.28.4 (2024-06-25)

- [Fixed] `<x-throbber>` animation freezes when changing the "hidden" attribute
- [Fixed] Backspace, arrow up and arrow down keyboard events should not be propagated when `<x-colorinput>` is focused

## 0.28.3 (2024-06-23)

- Handle `<x-menuitem>` click event like native Windows and GNOME apps
- Automatically select `<x-colorinput>` contents when it receives focus
- [Fixed] Can't change `<x-colorinput>` value when only a single color space is allowed
- [Fixed] `<x-numberinput>` does not properly discard invalid values

## 0.28.2 (2024-06-22)

- [Fixed] Incorrect z-index of button tooltips when using dark Fluent theme

## 0.28.1 (2024-06-22)

- [Fixed] Incorrect z-index of button tooltips when using Fluent theme

## 0.28.0 (2024-06-21)

- Add "expand" and "collapse" events to `<x-menubar>`

## 0.27.1 (2024-05-30)

- Make inner padding of `<x-numberinput>` configurable

## 0.27.0 (2024-05-21)

- [Changed API] Rename `<meta name="xel-iconsets">` to `<meta name="xel-icons">`
- [Changed API] Rename `Xel.iconsets` to `Xel.icons`
- [Changed API] Rename `Xel.whenIconsetsReady` to `Xel.whenIconsReady`
- [Changed API] rename `iconsetschange` event to `iconschange`
- [Fixed] `<x-contextmenu>` fails to render on WebKit in some edge cases

## 0.26.0 (2024-05-19)

- Add "sRGB Linear", "CIE LCH", "OK LCH", "CIE LAB", "OK LAB", "CIE XYZ D65" and "CIE XYZ D50" color spaces to the
  color picker
- Add "Out of gamut" indicator to the color space select widget
- Add color picker option to show gamut hints
- Add color picker option to show channel labels

## 0.25.11 (2024-04-01)

- [Fixed] "toggle" event on `<x-radios>` is not documented

## 0.25.10 (2024-03-27)

- [Fixed] Language parameter in blob URLs is ignored

## 0.25.9 (2024-03-25)

- [Fixed] Can't pass full URLs as `<x-message>` arguments

## 0.25.8 (2024-03-16)

- [Fixed] Don't show text selection inside blurred `<x-numberinput>`

## 0.25.7 (2024-03-09)

- [Fixed] Can't close modal popovers on WebKit

## 0.25.6 (2024-03-05)

- [Fixed] Error thrown when unfocusing text inputs on WebKit

## 0.25.5 (2024-02-20)

- [Fixed] Color picker throws errors when clearing localStorage

## 0.25.4 (2024-01-17)

- [Fixed] Button tooltips have incorrect font weight

## 0.25.3 (2024-01-14)

- [Fixed] Wrong cursor image when hovering a tag inside an anchor

## 0.25.2 (2024-01-11)

- [Fixed] Color input widget uses inconsistent value format in sRGB space

## 0.25.1 (2024-01-08)

- [Fixed] `<x-tabs>` are flickering when clicked
- [Fixed] Can't disable `<x-tab>`

## 0.25.0 (2023-12-31)

- Add option to expand/collapse `<x-accordion>` without animations
- Add `disabled` property to `<x-accordion>`

## 0.24.5 (2023-12-26)

- [Fixed] `<x-buttons>` element does not handle correctly child `<a>` elements

## 0.24.4 (2023-12-12)

- [Fixed] `<x-input type="search">` is not dispatching `change` event on latest versions of WebKit-based browsers

## 0.24.3 (2023-11-28)

- Simplify dock button stylings

## 0.24.2 (2023-10-29)

- Option to show color values using uppercase hexadecimal notation
- Make the leading "#" char optional when entering hexadecimal color values
- [Fixed] Popover arrow styles are not updated when changing themes

## 0.24.1 (2023-10-28)

- [Fixed] Can't focus `<x-tagsinput>` on WebKit

## 0.24.0 (2023-10-24)

- Replace `<x-barscolorpicker>`, `<x-rectcolorpicker>` and `<x-wheelcolorpicker>` with unified `<x-colorpicker>`
- Display P3, Rec. 2020, A98 RGB and ProPhoto wide gamut color spaces support
- Allow colors to be specified in any valid CSS format

## 0.23.0 (2023-09-24)

- Initial support for Firefox 119

## 0.22.6 (2023-08-28)

- [Fixed] Frozen cursor image when clicking elements with pointer capture

## 0.22.5 (2023-08-28)

- [Fixed] Incorrect cursor image when clicking elements with pointer capture very fast

## 0.22.4 (2023-08-27)

- [Fixed] Handle `pointercancel` events

## 0.22.3 (2023-08-27)

- [Fixed] Pointer is not properly released in some edge cases

## 0.22.2 (2023-08-25)

- [Fixed] "pointerup" event is not fired in some edge cases due to Chromium bug #1166044

## 0.22.1 (2023-08-12)

- [Fixed] Enter key from the numeric keypad is not detected correctly

## 0.22.0 (2023-08-12)

- Remove global size setting (`<meta name="xel-size">` tag, `Xel.size` getter/setter and corresponding
  `sizechange` event)
- Remove `Element.computedSize`  getter and corresponding attribute
- Remove support for relative size values (`smaller` and `larger`)

## 0.21.3 (2023-07-19)

- [Fixed] Ring throbber animation is no rendered properly by WebKit

## 0.21.2 (2023-07-12)

- [Fixed] Numeric glyphs inside `<x-numberinput>` have inconsistent width

## 0.21.1 (2023-06-25)

- [Fixed] `<x-slider>` should not be focusable when disabled

## 0.21.0 (2023-06-23)

- Add `disabled` property to color pickers

## 0.20.9 (2023-06-14)

- [Fixed] Outlines shown around focused dialogs

## 0.20.8 (2023-06-09)

- [Fixed] `<x-tagsinput>` leaves a trailing comma

## 0.20.7 (2023-05-25)

- [Fixed] Keyboard shortcuts are not working when `<x-numberinput>` is focused
- [Fixed] Incorrect selection on Safari after incrementing or decrementing `<x-numberinput>` value
- [Fixed] Tooltips should not be shown when a button is expanded

## 0.20.6 (2023-05-19)

- [Fixed] Opening a dialog causes layout shift on Safari

## 0.20.5 (2023-05-19)

- [Fixed] Adwaita and Cupertino themes use ugly fonts when on Safari

## 0.20.4 (2023-04-15)

- [Fixed] `<x-colorselect>` fails to open

## 0.20.3 (2023-04-08)

- [Fixed] `<x-popover>` misbehaves when placed inside shadowRoot

## 0.20.2 (2023-04-08)

- [Fixed] `<x-stepper>` stuck after pressing the left and right mouse buttons simultaneously

## 0.20.1 (2023-04-05)

- [Fixed] Automatically close standalone modal `<x-popover>` when user clicks the backdrop

## 0.20.0 (2023-04-01)

- WebKit-based browsers support

## 0.19.3 (2023-03-30)

- Resolve `<x-popover>` geometry after all "open" event listeners have been fired

## 0.19.2 (2023-03-23)

- Make `<x-numberinput>` use the step precision if it is bigger than the value precision

## 0.19.1 (2023-03-21)

- [Fixed] Do not animate newly connected switch elements

## 0.19.0 (2023-01-22)

- Add "os" message argument

## 0.18.2 (2022-12-23)

- [Fixed] Packaging script is not working on Windows

## 0.18.1 (2022-12-20)

- [Fixed] `<x-numberinput>` does not look and behave consistently with `<x-input>`

## 0.18.0 (2022-12-04)

- Replace `Xel.localesIds` getter with `Xel.locale` which return the resolved locale tag

## 0.17.6 (2022-11-08)

- Add stylings for `::highlight(mark)`

## 0.17.5 (2022-11-01)

- [Fixed] Button tooltip not shown when the button is attached directly to the shadow root

## 0.17.4 (2022-09-22)

- Update dependencies

## 0.17.3 (2022-08-18)

- [Fixed] `<x-tooltip>` is now shown when placed inside `<x-input>`

## 0.17.2 (2022-07-16)

- [Fixed] Opening the context menu multiple times in short intervals causes the app to freeze

## 0.17.1 (2022-07-07)

- [Fixed] Menus containing `<x-message>` elements are positioned incorrectly

## 0.17.0 (2022-06-14)

- Add `Xel.localesIds` getter
- Add `RELDATETIME` FTL function
- Add `ellipsis` property/attribute to `<x-message>`
- [Fixed] Invisible unicode characters added to `<x-message>` args

## 0.16.4 (2022-05-31)

- [Fixed] `setCustomValidity()` does not handle empty string argument correctly

## 0.16.3 (2022-05-30)

- Make default validation messages shorter

## 0.16.2 (2022-05-30)

- [Fixed] Calling `<x-tooltip>.open()` should not throw error when the tooltip is disconnected
- [Fixed] `<x-texteditor>` tooltip not shown in some edge cases

## 0.16.1 (2022-05-30)

- Make `reportValidity()` return a boolean with validation state

## 0.16.0 (2022-05-30)

- Add `<x-tooltip>` element
- Change `error` property/method on `<x-input>` and `<x-texteditor>` to a read-only boolean. The new
  `setCustomValidity()` method should be used for setting custom error messages from now on
- Rename `validate()` on `<x-input>` and `<x-texteditor>` to `reportValidity()`. The new `beforevalidate` event
  should be used to provide custom validation logic from now on
- Remove `required` and `error` property/method on `<x-numberinput>` and `<x-tagsinput>`

## 0.15.0 (2022-05-23)

- Add `autocapitalize` boolean attribute to `<x-message>`

## 0.14.0 (2022-05-05)

- Add `Xel.queryIcon()` and `Xel.queryMessage()` method
- Make `Xel.iconsetElements` and `Xel.localesBundle` properties private
- Change x-message API from `<x-message name="id">` to `<x-message href="#id">`
- Change x-icon API from `<x-icon name="id" iconset="path">` to `<x-icon href="path#id">`
- [Fixed] `<x-message>` adds extra whitespace when placed inside preformatted text

## 0.13.2 (2022-05-03)

- [Fixed] `<x-message>` fails to render compound messages

## 0.13.1 (2022-05-02)

- [Fixed] `<x-message>` treats numeric arguments as strings

## 0.13.0 (2022-05-01)

- Internationalization and localization support with new `Xel.locales` API and `<x-message>` element
- Rename `<meta name="xel-iconset">` to `<meta name="xel-iconsets">`
- Rename `Xel.iconset` to `Xel.iconsets` and make it return an array

## 0.12.0 (2022-04-09)

- Add Adwaita theme
- Add Adwaita Dark theme
- Remove Vanilla theme

## 0.11.0 (2022-03-13)

- Remove `<x-doctabs>` and `<x-doctab>`

## 0.10.2 (2022-02-20)

- [Fixed] Click events are not always detected when using macOS 12

## 0.10.1 (2022-01-07)

- Use ES syntax to denote private properties and methods

## 0.10.0 (2022-01-05)

- Remove the custom issue tracker (use GitHub instead)
- Move all files into a single GitHub repository
- Update documentation

## 0.9.12 (2021-12-19)

- [Fixed] NPM bundle contains unused files

## 0.9.11 (2021-12-07)

- [Fixed] Incorrect size of `<x-stepper>` inside condensed `<x-numberinput>`

## 0.9.10 (2021-09-24)

- [Fixed] Horizontal scrollbars are misaligned in the Fluent theme

## 0.9.9 (2021-09-24)

- [Fixed] `<x-texteditor>` scrollbars do not inherit default stylings

## 0.9.8 (2021-07-26)

- [Fixed] Do not close the dialog when user clicks the backdrop area of a popover

## 0.9.7 (2021-05-10)

- Update the license

## 0.9.6 (2021-05-02)

- [Fixed] base.css fails to load in some edge cases

## 0.9.5 (2021-04-26)

- [Fixed] Themes with relative URL fail to load

## 0.9.4 (2021-04-26)

- [Portal] [Fixed] Issue descriptions containing template strings fail to render

## 0.9.3 (2021-04-08)

- [Portal] [Fixed] Admin can't close issues

## 0.9.2 (2021-04-08)

- [Portal] [Fixed] Tags are not rendered correctly in the HTML version of the changelog

## 0.9.1 (2021-04-08)

- [Fixed] `<x-numberinput>` value is not set properly when changing focus to `<x-stepper>`
- [Portal] Add more `<x-doctabs>` examples
- [Portal] [Fixed] Syntax highlighting is not working with dark themes
- [Portal] [Fixed] Redirects are not working when using a local Firebase instance
- [Portal] [Fixed] Whitespace is missing between changelog tags
- [Portal] [Fixed] Always fetch the changelog from the public GitHub repository

## 0.9.0 (2021-04-06)

- Project rewrite using the latest Web Platform APIs
