# Barangay System Design System
## Modern Purple & Blue Glassmorphic Aesthetic

A sophisticated, modern design system featuring elegant purple gradients, glassmorphic effects, and smooth animations for professional barangay management interfaces.

---

## Color Palette

### Primary Gradient Colors
```
Purple Gradient (Primary):
- Start:  #667eea (Indigo Purple)
- End:    #764ba2 (Deep Purple)
- Usage:  Headers, gradients, primary backgrounds, CTAs

Blue Accent:
- #1890ff (Ant Design Blue) - Secondary accents, links
- #40a9ff (Light Blue) - Hover states

Supporting Colors:
- Success Green:   #10b981  (Approved items, positive states)
- Warning Amber:   #f59e0b  (Pending items, caution)
- Danger Red:      #ef4444  (Errors, urgent items)
- Info Cyan:       #0ea5e9  (Information, secondary actions)
- Orange:          #f97316  (Notifications)
```

### Neutral Colors
```
Text:
- Primary Text:    #0f172a  (Dark slate - main content)
- Secondary Text:  #475569  (Medium slate - secondary content)
- Tertiary Text:   #64748b  (Light slate - disabled/hints)
- Light Text:      #94a3b8  (Very light - subtle)

Backgrounds:
- Card Background:      rgba(255, 255, 255, 0.98)  (Glossy white with transparency)
- Alt Background:       rgba(248, 250, 255, 0.96)  (Soft bluish white)
- Hover Background:     rgba(255, 255, 255, 0.9)   (Slightly more opaque)
- Overlay:              rgba(255, 255, 255, 0.6)   (Semi-transparent)
- Page Background:      linear-gradient(135deg, #667eea 0%, #764ba2 100%)  (Purple gradient)

Borders:
- Primary Border:       rgba(102, 126, 234, 0.2)   (Purple-tinted, subtle)
- Secondary Border:     #e2e8f0                     (Light gray)
- Hover Border:         #667eea                     (Purple)
```

### Glass Effect Colors
```
Glass backgrounds use combination of:
- White with 0.95-0.98 opacity
- Backdrop blur: 8px-20px
- Subtle purple/blue borders at 0.2 opacity
- Drop shadows for depth

Example:
background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 255, 0.96) 100%)
border: 1.5px solid rgba(102, 126, 234, 0.2)
backdrop-filter: blur(20px)
box-shadow: 0 20px 40px rgba(102, 126, 234, 0.15), 0 0 1px rgba(102, 126, 234, 0.3)
```

---

## Typography

### Hierarchy

**Page Title / Brand Name:**
- Size: 21px
- Weight: 800
- Color: Gradient (linear-gradient(135deg, #667eea 0%, #764ba2 100%))
- Letter-spacing: -0.48px
- Example: "System ni Rodney" on login form

**Section Headers:**
- Size: 16px
- Weight: 800
- Color: #0f172a (dark slate)
- Letter-spacing: -0.3px
- Example: "Quick Stats", "Barangay Officials"

**Card Titles / Subtitles:**
- Size: 12px
- Weight: 700
- Color: #0f172a
- Letter-spacing: -0.3px
- Optional: Icon prefix with color accent

**Body Text:**
- Size: 11-12px
- Weight: 400-500
- Color: #475569 (secondary text)
- Line-height: 1.5

**Labels / Tags:**
- Size: 9px
- Weight: 700
- Color: #667eea (purple)
- Text-transform: uppercase
- Letter-spacing: 0.48px

**KPI Values:**
- Size: 24px (standalone cards) / 18px (inline)
- Weight: 700
- Color: Color-specific based on type
- Example: "19" for users, "5" for announcements
```

### Font Stack
```
Primary: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
Fallback: system fonts for web safety
All text uses letter-spacing adjustments for premium feel
```

---

## Spacing & Layout

### Spacing Scale
```
xs:  4px
sm:  8px
md:  12px
lg:  16px
xl:  20px
2xl: 24px
3xl: 32px
4xl: 40px
```

### Component Spacing
```
Page Container:
- Padding: 40px 20px (desktop), 20px (mobile)
- Gap between major sections: 20px

Card Padding:
- Standard cards: 19px
- Login form card: 35px
- Stats panel header: 20px with 16px bottom padding

Internal Spacing:
- Section gaps: 16px
- Item gaps: 11px (info items), 10px (carousels), 14px (stat items)
- Form input gaps: 18-22px between fields
- List item gaps: 10px
```

### Layout Grid
```
Row gutter: [22, 22] (horizontal and vertical spacing)
Column layout:
- Mobile: Full width (xs={24})
- Tablet: Full width (sm={24}, md={24})
- Desktop: Full width with flexDirection: 'column' for vertical stacking

All sections arranged vertically (flexDirection: 'column') on larger screens
```

---

## Shadow System

### Shadow Variants

**Soft/Subtle Shadow (Cards at rest):**
```
0 6px 16px rgba(102, 126, 234, 0.08)
0 20px 40px rgba(102, 126, 234, 0.15), 0 0 1px rgba(102, 126, 234, 0.3)
```

**Medium Shadow (Glass cards, modest elevation):**
```
0 10px 22px rgba(102, 126, 234, 0.1)
0 16px 32px rgba(102, 126, 234, 0.15), 0 0 1px rgba(102, 126, 234, 0.3)
```

**Strong Shadow (Elevated elements, hover states):**
```
0 12px 28px rgba(102, 126, 234, 0.25)
0 20px 40px rgba(102, 126, 234, 0.2), 0 0 1px rgba(102, 126, 234, 0.4)
```

**Interactive Shadow (Buttons, CTAs):**
```
0 10px 19px rgba(102, 126, 234, 0.35)
0 16px 32px rgba(102, 126, 234, 0.45)
```

All shadows use purple/indigo tints for cohesion with color scheme.
```

### Border Radius
```
Large elements (cards, modals):  14-16px
Medium elements (badges, info):  10-13px
Small elements (buttons, icons): 8px
Circular (avatars):               6px or 50%
```

---

## Animations & Transitions

### Easing Functions

**Standard Easing (most transitions):**
```
cubic-bezier(0.4, 0, 0.2, 1)
Used for: Card hovers, focus states, fade-ins
Duration: 0.3s (300ms)
```

**Spring/Bounce Easing (playful feedback):**
```
cubic-bezier(0.34, 1.56, 0.64, 1)
Used for: Arrow indicators on menu items, celebratory animations
Duration: 0.6s (600ms)
```

**Quick Easing (micro-interactions):**
```
cubic-bezier(0.4, 0, 0.2, 1)
Duration: 0.2s (200ms)
Used for: Button ripples, hover borders
```

### Transform Effects

**Hover Lift:**
```
transform: translateY(-2px)
Used on: Buttons, card hovers, info items
Paired with: Enhanced shadow
```

**Slight Elevation:**
```
transform: translateY(-1px)
Used on: Subtle hover feedback
```

**Arrow Animation (Spring):**
```
Keyframes: 0% { opacity: 0; transform: translateY(-50%) translateX(6px); }
           100% { opacity: 1; transform: translateY(-50%) translateX(0); }
Duration: 0.6s
Timing: cubic-bezier(0.34, 1.56, 0.64, 1)
Applied to: Active menu item indicators
```

### Global Transitions
```
All interactive elements: transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1)
Used for smooth color changes, shadow updates, and layout shifts
```

---

## Component Patterns & Usage

### Login Form Card
```
Purpose: Authentication interface
Background: Linear gradient (rgba(255, 255, 255, 0.98) to rgba(248, 250, 255, 0.96))
Border: 1.5px solid rgba(102, 126, 234, 0.2)
Border-radius: 14px
Padding: 35px
Box-shadow: 0 20px 40px rgba(102, 126, 234, 0.2), 0 0 1px rgba(102, 126, 234, 0.4)
Backdrop-filter: blur(20px)

Title:
- Gradient text: linear-gradient(135deg, #667eea 0%, #764ba2 100%)
- Size: 21px, weight: 800
- Centered alignment

Input Fields:
- Background: rgba(248, 250, 255, 0.6)
- Border: 1.5px solid #e2e8f0
- Border-radius: 8px
- Focus border: #667eea
- Focus shadow: 0 0 0 3px rgba(102, 126, 234, 0.1)
- Transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)

Buttons:
- Primary (Sign In):
  - Background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)
  - Color: #ffffff
  - Border: none
  - Border-radius: 8px
  - Height: 38px
  - Font: 700, 12px, -0.24px letter-spacing
  - Shadow: 0 10px 19px rgba(102, 126, 234, 0.35)
  - Hover shadow: 0 16px 32px rgba(102, 126, 234, 0.45)
  - Hover transform: translateY(-2px)

- Secondary (Guest):
  - Background: rgba(102, 126, 234, 0.1)
  - Border: 2px solid #667eea
  - Color: #667eea
  - Hover: background becomes #667eea, color becomes #ffffff
```

### Stats Panel / Quick Stats
```
Purpose: Dashboard overview metrics
Layout: Full-width card with horizontal grid of items
Container:
- Background: rgba(255, 255, 255, 0.95)
- Border: 1px solid rgba(255, 255, 255, 0.3)
- Border-radius: 16px
- Padding: 0 (header has its own padding)
- Backdrop-filter: blur(10px)
- Box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1)

Header:
- Padding: 20px 20px 16px 20px
- Display: flex with gap: 10px
- Gradient bar: width 4px, height 24px, gradient (180deg, #667eea → #764ba2)

Stats Grid:
- Gutter: [14, 14]
- Items per row: 6 (lg), 2 (xs/sm/md)
- Each item: 
  - Background: Semi-transparent color
  - Border: 1px solid with color opacity
  - Border-radius: 12px
  - Padding: Flex column with gap 10px
  - Text-align: center
  - Transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1)
  - Cursor: pointer

Item Values:
- Icon: 24px, specific color
- Number: 32px weight 700
- Label: 12px weight 600, uppercase, 0.5px letter-spacing
```

### Officials Card (Vertical Carousel)
```
Purpose: Display barangay officials roster
Container:
- Same glass style as cards
- Flex column with gap 10px
- Flex: 1 (fill parent height)

Header:
- Icon prefix (🏛️)
- Title: 12px, weight 700
- Gradient underline border

Carousel Container:
- Overflow-y: auto (scrollable)
- Padding-right: 8px (scroll space)
- Scroll-behavior: smooth
- Flex: 1, gap: 10px

Official Card (Item):
- Background: #ffffff
- Border: 1px solid #e2e8f0
- Border-radius: 8px
- Padding: 10px
- Display: flex with gap 8px
- Transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1)
- Cursor: pointer
- Hover:
  - Box-shadow: 0 12px 24px rgba(102, 126, 234, 0.15)
  - Transform: translateY(-2px)
  - Border-color: #667eea

Avatar:
- Width/Height: 38px
- Border-radius: 6px
- Background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)
- Border: 2px solid rgba(102, 126, 234, 0.2)
- Flex-shrink: 0

Text Content:
- Name: 11px, weight 700, color #0f172a
- Title: 9px, weight 500, color #64748b
- Term: 8px, color #94a3b8
```

### Barangay Information / Contact Cards
```
Purpose: Display public information
Container:
- Same glass style (gradient background, border, blur)
- Border-radius: 16px
- Padding: 19px
- Height: 100%
- Display: flex flex-column

Header:
- Display: flex, gap 10px
- Margin-bottom: 16px, padding-bottom: 13px
- Border-bottom: 1.5px solid rgba(102, 126, 234, 0.1)
- Icon: 13px, #667eea
- Title: 12px, weight 700, #0f172a

Items Grid:
- Display: flex flex-column
- Gap: 11px
- Flex: 1

Info Item:
- Background: linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(248, 250, 255, 0.4) 100%)
- Border: 1.5px solid rgba(102, 126, 234, 0.2)
- Border-radius: 10px
- Padding: 13px
- Text-align: center
- Box-shadow: 0 6px 16px rgba(102, 126, 234, 0.08)
- Transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1)
- Cursor: pointer
- Hover:
  - Box-shadow: 0 12px 28px rgba(102, 126, 234, 0.25)
  - Border-color: #667eea
  - Background: lighter gradient

Icon: 22px emoji
Label: 9px, weight 700, uppercase, #667eea, letter-spacing 0.48px
Value: 11px, weight 700, #0f172a
```

### System Notice Alert
```
Purpose: Display important system messages
Type: info (not warning - updated)
Background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 255, 0.96) 100%)
Border: 1.5px solid rgba(102, 126, 234, 0.2)
Border-radius: 11px
Padding: 14px 16px
Box-shadow: 0 10px 22px rgba(102, 126, 234, 0.1)
Backdrop-filter: blur(10px)
Closable: true

Message:
- Color: #0f172a
- Font: 12px, weight 700
- Icon: BellOutlined, #667eea, 14px

Description:
- Color: #475569
- Font: 11px
- Line-height: 1.5
- Margin: 0
```

---

## Interaction Patterns

### Button States & Styles

**Primary Gradient Button (CTAs):**
```
Default:
- Background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)
- Color: #ffffff
- Border: none
- Height: 38-44px
- Border-radius: 8px
- Font: weight 700, 12px
- Shadow: 0 10px 19px rgba(102, 126, 234, 0.35)

Hover:
- Shadow: 0 16px 32px rgba(102, 126, 234, 0.45)
- Transform: translateY(-2px)

Active/Pressed:
- Shadow decreases slightly
- No transform change

Disabled:
- Opacity: 0.6
- Cursor: not-allowed
```

**Secondary Bordered Button:**
```
Default:
- Background: rgba(102, 126, 234, 0.1)
- Border: 2px solid #667eea
- Color: #667eea
- Height: 38px
- Border-radius: 8px

Hover:
- Background: #667eea
- Color: #ffffff
- Box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3)

Active:
- Border and text darken to #764ba2
```

**Link/Text Button:**
```
Default:
- Color: #667eea
- No background
- Weight: 600
- Font-size: 11px
- Transition: all 0.2s

Hover:
- Color: #764ba2
- Optional underline

Active:
- Color: darker purple
```

### Card Hover States
```
Inactive State:
- Background: linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(248, 250, 255, 0.4) 100%)
- Border: 1.5px solid rgba(102, 126, 234, 0.2)
- Shadow: 0 6px 16px rgba(102, 126, 234, 0.08)

Hover State:
- Background: linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 250, 255, 0.7) 100%)
- Border-color: #667eea
- Shadow: 0 12px 28px rgba(102, 126, 234, 0.25)
- Transform: translateY(-2px)
- Timing: 0.3s cubic-bezier(0.4, 0, 0.2, 1)

Click/Focus State:
- Shadow increases to 0 16px 32px
- Border remains purple
- No additional lift
```

### Input Focus States
```
Unfocused:
- Border: 1.5px solid #e2e8f0
- Background: rgba(248, 250, 255, 0.6)
- Shadow: none
- Text color: #0f172a

Focused:
- Border-color: #667eea
- Background: rgba(248, 250, 255, 1)
- Box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1)
- Text color: #0f172a
- Cursor: text

Error:
- Border-color: #ef4444
- Box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1)
- Background: unchanged

Disabled:
- Border: 1.5px solid #e5e7eb
- Background: #f3f4f6
- Color: #9ca3af
- Cursor: not-allowed
```

---

## Responsive Design

### Breakpoints
```
Mobile:    width < 576px
Tablet:    576px ≤ width < 992px
Desktop:   992px ≤ width < 1200px
Large:     width ≥ 1200px
```

### Layout Strategy
```
Mobile (<576px):
- Single column layout
- Full width cards with padding
- Vertical stack for all sections
- Reduced padding: 20px instead of 40px
- Touch-friendly button heights: 44px+
- Smaller icons: 18-20px

Tablet (576px-992px):
- Single or 2-column layout where appropriate
- Full-width cards remain
- Maintained spacing
- All sections still vertical

Desktop (992px-1200px):
- Primary: Single full-width vertical layout
- Cards remain full width
- Vertical stacking for sections
- Standard padding: 40px 20px

Large (1200px+):
- Same as desktop
- Single vertical column throughout
- No side-by-side card layouts
```

### Responsive Utilities
```
Column Breakpoints:
- xs={24}  (mobile: full width)
- sm={24}  (tablet: full width)
- md={24}  (desktop: full width)
- lg={24}  (large: full width)
- All sections use flexDirection: 'column' for vertical layout

Stats Panel:
- lg: 6 columns (one row) = xs 12, sm 12, md 12, lg 4 per item
- Enables horizontal line of 6 items on larger screens
```

---

## Professional Design Principles

✅ **Purple Gradient Dominance** - Modern, sophisticated primary colors
✅ **Glassmorphic Effects** - Frosted glass aesthetic with backdrop blur
✅ **Hierarchy Through Gradient** - Text, cards, and UI elements use purple tints
✅ **Consistency** - Unified spacing, shadows, and component patterns
✅ **Generous Whitespace** - Clean, breathable layouts
✅ **Smooth Animations** - 0.3s cubic-bezier transitions for natural movement
✅ **Color-Coded Information** - Semantic colors for status (green, amber, red)
✅ **Typography Refinement** - Premium letter-spacing, consistent weights
✅ **Accessibility** - WCAG AA+ contrast ratios, focus indicators
✅ **Modern Aesthetics** - Current design trends (gradients, glass, shadows)

---

## Implementation Guide

### Color Usage Examples

**Success/Positive Actions:**
```
Background: rgba(16, 185, 129, 0.08)  // Green
Border: #10b981
Text: #10b981
Shadow tint: rgba(16, 185, 129, 0.15)
```

**Warnings/Pending:**
```
Background: rgba(245, 158, 11, 0.08)  // Amber
Border: #f59e0b
Text: #f59e0b
```

**Critical/Errors:**
```
Background: rgba(239, 68, 68, 0.08)  // Red
Border: #ef4444
Text: #ef4444
```

**Info/Secondary:**
```
Background: rgba(14, 165, 233, 0.08)  // Cyan
Border: #0ea5e9
Text: #0ea5e9
```

### Shadow Stack
```
Subtle:  0 6px 16px rgba(102, 126, 234, 0.08)
Normal:  0 10px 22px rgba(102, 126, 234, 0.1)
Hover:   0 12px 28px rgba(102, 126, 234, 0.25)
Lifted:  0 16px 32px rgba(102, 126, 234, 0.15) + 0 0 1px rgba(102, 126, 234, 0.3)
```

### Glass Effect Recipe
```
background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 255, 0.96) 100%);
border: 1.5px solid rgba(102, 126, 234, 0.2);
border-radius: 14-16px;
backdrop-filter: blur(10-20px);
box-shadow: 0 10px-20px 22px-40px rgba(102, 126, 234, 0.1-0.2) + 0 0 1px rgba(102, 126, 234, 0.3);
```

---

## Component Files Reference

**Login/Authentication:**
- `LoginForm.tsx` - Primary login interface with glassmorphic design

**Dashboards:**
- `AdminDashboard.tsx` - Admin overview with KPI cards and statistics
- `StaffDashboard.tsx` - Staff operational dashboard
- `Statistics.tsx` - Analytics and reporting interface

**Admin Interfaces:**
- `SystemSettings.tsx` - System configuration and officials management
- `UserManagement.tsx` - User administration
- `Announcements.tsx` - Announcement creation and display
- `DocumentProcessing.tsx` - Document workflow management

**Data & Support:**
- `StatsPanel.tsx` - Reusable statistics display component
- `TemplatesManager.tsx` - Document template management

All components follow the established color palette, spacing system, shadow variants, and animation timings defined in this document.
