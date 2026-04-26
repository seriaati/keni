---
name: Keni
description: Personal finance tracker — AI-powered transaction logging without the friction.
colors:
  warm-parchment: "oklch(97% 0.012 85)"
  warm-parchment-mid: "oklch(93% 0.018 80)"
  warm-parchment-deep: "oklch(88% 0.022 78)"
  sand: "oklch(82% 0.028 75)"
  sand-deep: "oklch(72% 0.032 72)"
  near-black-warm: "oklch(18% 0.01 80)"
  near-black-warm-mid: "oklch(28% 0.01 80)"
  near-black-warm-light: "oklch(45% 0.01 80)"
  near-black-warm-tint: "oklch(90% 0.005 80)"
  ink: "oklch(18% 0.02 80)"
  ink-mid: "oklch(35% 0.02 80)"
  ink-light: "oklch(55% 0.018 80)"
  ink-faint: "oklch(72% 0.015 80)"
  burnished-amber: "oklch(72% 0.14 65)"
  burnished-amber-light: "oklch(82% 0.12 70)"
  rose: "oklch(52% 0.12 20)"
  rose-light: "oklch(93% 0.02 20)"
  rose-border: "oklch(82% 0.04 20)"
  sky: "oklch(62% 0.1 230)"
typography:
  display:
    fontFamily: "'Instrument Serif', Georgia, serif"
    fontSize: "clamp(24px, 4vw, 32px)"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "'Instrument Serif', Georgia, serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.2
  body:
    fontFamily: "'DM Sans', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'DM Sans', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  small:
    fontFamily: "'DM Sans', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  xl: "24px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.near-black-warm}"
    textColor: "{colors.warm-parchment}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "38px"
  button-primary-hover:
    backgroundColor: "{colors.near-black-warm-mid}"
    textColor: "{colors.warm-parchment}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "38px"
  button-secondary:
    backgroundColor: "{colors.warm-parchment-mid}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "38px"
  button-secondary-hover:
    backgroundColor: "{colors.warm-parchment-deep}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "38px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-mid}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "38px"
  button-ghost-hover:
    backgroundColor: "{colors.warm-parchment-mid}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "38px"
  button-danger:
    backgroundColor: "{colors.rose-light}"
    textColor: "{colors.rose}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "38px"
  input:
    backgroundColor: "white"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
    height: "38px"
  card:
    backgroundColor: "white"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
---

# Design System: Keni

## 1. Overview

**Creative North Star: "The Still Notebook"**

Keni is a tool for the daily practice of financial clarity. Its design language draws from the physical notebook: deliberate, unhurried, built to be used without thinking about it. Surfaces are parchment-warm rather than clinical white. Type is chosen to feel written-into rather than rendered. Every interaction is quiet enough that the data inside it can speak louder than the chrome around it.

The system does not celebrate itself. Buttons do not animate triumphantly; inputs do not shimmer with gradient focus states; the dashboard does not resemble a command center. The interface recedes — as a good notebook does — so the record inside it feels like the point.

This is explicitly not a fintech product with urgency baked into its visuals. It avoids the compulsive metrics density of Mint and Personal Capital, the neon of crypto wallets, and the over-animated productivity tools that clap for you. Keni's restraint is a design position, not a lack of ambition.

**Key Characteristics:**
- Warm parchment surfaces instead of neutral white or dark backgrounds
- Near-black text with warm undertone — never pure black, never cool grey
- Burnished amber as the single chromatic accent, used sparingly enough that it registers when it appears
- Instrument Serif in italic for display moments only; DM Sans everywhere else
- Flat at rest, soft shadow on elevation — depth earned, not assumed
- Expo ease-out on all entrances; no bounce, no elastic, no spring

## 2. Colors: The Warm Ledger Palette

A restrained palette built from warm-tinted neutrals. Burnished Amber is the only chromatic color; everything else runs from near-black to near-white within the same warm hue family.

### Primary
- **Near-Black Warm** (`oklch(18% 0.01 80)`): Primary actions, primary button background, sidebar's quick-add button. The core ink of the system — warm enough to avoid coldness, dark enough to anchor the palette.
- **Near-Black Warm Mid** (`oklch(28% 0.01 80)`): Hover state for primary surfaces, focus ring border color, active navigation text.
- **Near-Black Warm Light** (`oklch(45% 0.01 80)`): User role label in sidebar. The lightest step before becoming a neutral mid-tone.
- **Near-Black Warm Tint** (`oklch(90% 0.005 80)`): Active navigation item background. A barely-there wash of the primary color — signals selection without shouting.

### Secondary
- **Burnished Amber** (`oklch(72% 0.14 65)`): The system's single chromatic voice. Used for warning badges, PWA install prompt, and any moment that needs warmth beyond the neutral range. Never decorative — only functional.
- **Burnished Amber Light** (`oklch(82% 0.12 70)`): Soft amber tint for hover states on amber-colored elements.

### Tertiary
- **Rose** (`oklch(52% 0.12 20)`): Error states, danger button text, destructive feedback. Muted enough to avoid alarm in a calm interface.
- **Sky** (`oklch(62% 0.1 230)`): Informational links and secondary status. The system does not lean on blue.

### Neutral
- **Warm Parchment** (`oklch(97% 0.012 85)`): The page canvas. Warm and slightly golden, never pure white.
- **Warm Parchment Mid** (`oklch(93% 0.018 80)`): Secondary surfaces — skeleton loaders, secondary button background, tab-group container.
- **Warm Parchment Deep** (`oklch(88% 0.022 78)`): Dividers, card borders, hover on secondary buttons.
- **Sand** (`oklch(82% 0.028 75)`): Input and select borders at rest, scrollbar thumb.
- **Sand Deep** (`oklch(72% 0.032 72)`): Scrollbar thumb hover.
- **Ink** (`oklch(18% 0.02 80)`): Body text and content. Slightly warmer than Near-Black Warm.
- **Ink Mid** (`oklch(35% 0.02 80)`): Secondary text, nav items at rest, ghost button text.
- **Ink Light** (`oklch(55% 0.018 80)`): Tertiary text, subtitles, empty state descriptions.
- **Ink Faint** (`oklch(72% 0.015 80)`): Placeholder text, ghost icons.

### Named Rules
**The One Accent Rule.** Burnished Amber is the system's only chromatic color. It appears on less than 5% of any given screen. Resist adding secondary accents. If a new semantic role needs color, use a neutral tonal variant before reaching for a new hue.

**The No-White Canvas Rule.** Pure white is reserved for elevated surfaces only — card backgrounds, sidebar, modal, inputs. The page background is always Warm Parchment. Never white for the canvas.

## 3. Typography: Editorial Utility

**Display Font:** Instrument Serif (with Georgia, serif fallback)
**Body Font:** DM Sans (with system-ui, sans-serif fallback)

**Character:** Instrument Serif arrives only at moments of identity — page titles, modal headers, the wordmark in the sidebar — and always in italic. DM Sans handles everything else with quiet competence. The pairing is editorial without being precious: the serif earns its appearances precisely because they are rare.

### Hierarchy
- **Display** (400 italic, clamp(24px, 4vw, 32px), line-height 1.2): Page titles only. Instrument Serif, italic. The anchor for each screen.
- **Title** (400 italic, 20px, line-height 1.2): Modal headers, named section anchors. Instrument Serif.
- **Body** (400, 14px, line-height 1.5): All UI prose, descriptions, transaction notes. DM Sans. Cap at 65ch for readable line lengths.
- **Label** (500, 13px, line-height 1.4): Input labels, nav items, button text, badge text. DM Sans medium — slightly heavier to hold at small sizes.
- **Small** (400, 12px, line-height 1.4): Timestamps, sub-labels, currency codes, metadata. The smallest practical size in the system.

### Named Rules
**The Serif Scarcity Rule.** Instrument Serif appears at one or two moments per screen maximum. If a third element reaches for the serif, use DM Sans instead. Rarity is the point.

**The No-Italic-Sans Rule.** Italic is Instrument Serif's domain. DM Sans never italicizes in this system — weight and size carry emphasis.

## 4. Elevation

Flat at rest. Shadows are a functional response to state: they signal that a surface floats above the base layer, not that it is decorative. Shadows are never used as decoration.

Surfaces at rest — nav, page content, form fields — carry no shadow. Elevation belongs only to surfaces genuinely above the base layer: dropdowns, modals, floating action buttons, toasts.

### Shadow Vocabulary
- **Surface Lift** (`0 1px 3px oklch(18% 0.02 80 / 0.08)`): Active tab within a tab group. The smallest perceptible separation — barely a shadow, more of a surface marker.
- **Dropdown** (`0 2px 8px oklch(18% 0.02 80 / 0.1), 0 1px 2px oklch(18% 0.02 80 / 0.06)`): Cards at rest, standard dropdowns. The working shadow of the system.
- **Overlay Low** (`0 8px 32px oklch(18% 0.02 80 / 0.12), 0 2px 8px oklch(18% 0.02 80 / 0.08)`): Opened dropdowns, wallet selector panel, FAB, toasts. A clear step above the base.
- **Overlay High** (`0 20px 60px oklch(18% 0.02 80 / 0.18), 0 4px 16px oklch(18% 0.02 80 / 0.1)`): Modals only. The highest layer in the system.

### Named Rules
**The Flat-By-Default Rule.** A surface has no shadow at rest. Shadow is added only when a surface floats above another. If something is inline — a card in a list, a form field, a nav item — it has no shadow.

## 5. Components

### Buttons
Tactile and grounded. Four variants cover every intent without overlap.

- **Shape:** Gently curved corners (10px radius), consistent across all sizes.
- **Primary:** Near-Black Warm background, Warm Parchment text. Sizes — sm: 32px height, 13px, 6px/12px padding; md: 38px height, 14px, 8px/16px padding; lg: 44px height, 15px, 10px/20px padding. Hover to Near-Black Warm Mid (0.15s ease).
- **Secondary:** Warm Parchment Mid background, 1px Sand border, Ink text. Hover to Warm Parchment Deep. For non-destructive secondary actions.
- **Ghost:** Transparent background, Ink Mid text. Hover reveals Warm Parchment Mid wash. For dense contexts where a border adds visual noise.
- **Danger:** Rose Light background, 1px Rose Border, Rose text. Hover to Rose Border background. For destructive confirmations.
- **Loading state:** 14px spinner (currentColor, transparent top border, 0.6s linear) prepended. Button disabled during load.
- **Disabled:** 50% opacity, `cursor: not-allowed`.
- **Focus:** `outline: 2px solid oklch(28% 0.01 80)`, 2px offset, `:focus-visible` only.

### Inputs / Fields
Stroke-style fields with a focused-earth treatment on interaction.

- **Style:** White background, 1.5px Sand border, 10px radius, 14px DM Sans, 9px/12px padding.
- **Focus:** Border shifts to Near-Black Warm Mid, 3px shadow ring (`oklch(28% 0.01 80 / 0.12)`). Transition 0.15s ease.
- **Error:** Border becomes Rose. Error message at 12px Rose below the field.
- **Placeholder:** Ink Faint.
- **Labels:** 13px DM Sans medium, Ink Mid, 6px gap below.

### Cards / Containers
- **Corner Style:** Generously rounded at 16px (standard); 10px for compact cards.
- **Background:** White — one step above the Warm Parchment page surface.
- **Shadow:** Dropdown shadow at rest (`0 2px 8px / 0.1`). No hover lift.
- **Border:** 1px Warm Parchment Deep.
- **Internal Padding:** 20px standard; 14px/16px compact.

### Chips / Badges
- **Chip:** Fully rounded (100px), Warm Parchment Mid background, 1px Warm Parchment Deep border, Ink Mid text, 12px medium, 3px/10px padding.
- **Badge default:** Warm Parchment Mid background, Ink Mid text.
- **Badge green:** Near-Black Warm Tint background, Near-Black Warm text.
- **Badge amber:** `oklch(94% 0.06 70)` background, `oklch(52% 0.14 65)` text.
- **Badge red:** Rose Light background, Rose text.

### Tabs
Segmented control. The container is the group signal; the active tab lifts out of it.

- **Container:** Warm Parchment Mid background, 10px radius, 3px inner padding.
- **Inactive:** Transparent background, Ink Light text, 13px medium. Hover: Ink text.
- **Active:** White background, Surface Lift shadow, Ink text.
- **Transition:** 0.15s ease all properties.

### Navigation (Sidebar)
- **Container:** White sidebar, 240px wide, sticky full-height, 1px Warm Parchment Deep right border.
- **Nav items:** 13.5px DM Sans, Ink Mid at rest, 8px/10px padding, 6px radius. Hover: Warm Parchment background, Ink text. Active: Near-Black Warm Tint background, Near-Black Warm text, 500 weight.
- **Quick-add button:** Full Near-Black Warm background, Warm Parchment text — the highest-contrast element in the sidebar.
- **Mobile:** Slides in from left with `transform: translateX(-100% → 0)` on 0.25s expo ease-out. Backdrop overlay at `oklch(18% 0.02 80 / 0.4)`.

### Modal
- **Shape:** White, 24px radius, Overlay High shadow.
- **Sizes:** sm 380px, md 480px, lg 600px max-width.
- **Backdrop:** `oklch(18% 0.02 80 / 0.4)` with 2px blur. Click-outside closes; Escape closes.
- **Header:** 20px Instrument Serif italic title, icon-btn close at right.
- **Body:** 16px/24px padding, 16px gap between elements.
- **Animation:** scaleIn (0.96 → 1.0) on 0.2s expo ease-out.

### Command Bar (Signature Component)
The ⌘K command bar is Keni's primary input surface — the fastest path to logging a transaction. It receives elevated visual weight: full-width presentation, a placeholder written in Instrument Serif voice, and instant-response animation. It is the one moment in the system where the input is the feature, not a supporting element.

## 6. Do's and Don'ts

### Do:
- **Do** use Warm Parchment (`oklch(97% 0.012 85)`) as the page background. Never pure white for the canvas.
- **Do** render page titles and modal headers in Instrument Serif italic. That is its only role in the system.
- **Do** use Near-Black Warm for primary buttons and primary navigation. The warmth matters: cool near-black reads as tech-generic.
- **Do** keep Burnished Amber below 5% of any screen surface. Its value is in its rarity.
- **Do** apply shadows only to genuinely elevated surfaces: dropdowns, modals, FAB, toasts.
- **Do** use expo ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`) for all entrance animations. No bounce, no elastic.
- **Do** keep focus states visible: 2px Near-Black Warm outline, 2px offset, `:focus-visible` only.

### Don't:
- **Don't** use gradient text (`background-clip: text` + gradient). Emphasis via weight or size only.
- **Don't** use `border-left` greater than 1px as a colored stripe on cards, list items, or callouts. Use background tints or full borders.
- **Don't** build a metrics-grid dashboard layout — big numbers, small labels, gradient accent cards. That is Mint's language.
- **Don't** use glassmorphism decoratively. Blur is reserved for modal backdrops only.
- **Don't** introduce a dark mode or dark surface as a default. The system is light.
- **Don't** add a second chromatic accent. If a new semantic role needs color, extend the neutral tonal scale first.
- **Don't** use identical card grids (same-size cards, icon + heading + text, repeated). Use lists, table rows, or varied layouts.
- **Don't** animate standard hover states with scale or translate on UI components. Reserve transform animations for entrances and the FAB only.
- **Don't** exceed chroma 0.14 in any new color introduced. Burnished Amber is the maximum.
