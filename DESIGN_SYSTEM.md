# Staff Dashboard Visual Design Guide

## Design System Overview

### Color Palette
```
Primary Colors:
- Primary Teal:    #0f766e  (Primary actions, main accents)
- Cyan:            #0891b2  (Secondary actions, documents)
- Success Green:   #52c41a  (Approved/completed items)
- Warning Amber:   #faad14  (Pending items)
- Danger Red:      #dc2626  (Inbox messages, urgent items)

Neutrals:
- Text Primary:    #0f172a  (Main content)
- Text Secondary:  #6b7280  (Secondary content)
- Text Tertiary:   #9ca3af  (Disabled/placeholder)
- Border:          #e5e7eb  (Card borders, dividers)
- Background:      #ffffff  (Cards, modals)
- Background Alt:  #f9fafb  (Hover states, sections)
- Page Background: #f8fafb  (Main page background)
```

### Typography
```
Dashboard Title:
- Size: 24px (level 2)
- Weight: 700
- Color: #0f172a
- Line-height: 1.35

Subtitle:
- Size: 14px
- Weight: 400
- Color: #6b7280

Card Title:
- Size: 15px
- Weight: 700
- Color: #0f172a

KPI Number:
- Size: 32px
- Weight: 700
- Color: Color-specific (warning, cyan, green, red)

Labels:
- Size: 12px
- Weight: 600
- Text-transform: uppercase
- Letter-spacing: 0.5px
- Color: #6b7280
```

### Spacing System
```
Component Padding:
- Page padding: 24px
- Card padding: 20px (KPI cards) / 16px (content cards)
- Section gap: 20px
- Row margin: 32px
- Internal gap: 8px-16px

Margins:
- Section bottom: 32px
- Row/Col gap: 20px
- Item gap: 8px-16px
```

### Shadow System
```
Default Shadow (Idle):
0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.08)

Hover Shadow (Elevated):
0 4px 16px rgba(0, 0, 0, 0.1), 0 8px 24px rgba(0, 0, 0, 0.08)

Interactive Shadow (Focus):
0 10px 32px rgba(0, 0, 0, 0.12), 0 16px 48px rgba(0, 0, 0, 0.1)
```

### Border Radius
```
Cards/Modals:     12px
Buttons:          6px
Input fields:     6px
Avatar:           50% (circular)
Badges/Tags:      6px
```

### Animations & Transitions
```
Cubic-Bezier Easing:
- Standard: cubic-bezier(0.4, 0, 0.2, 1) - smooth, natural
- Bounce: cubic-bezier(0.34, 1.56, 0.64, 1) - playful, responsive

Duration:
- Short: 200ms (micro-interactions)
- Standard: 300ms (card hover, modal appear)
- Long: 500ms+ (page transitions)

Effects:
- Hover lift: translateY(-2px)
- Slight elevation: translateY(-1px)
- No rotation or complex transforms for professional feel
```

## Component Specifications

### KPI Cards
```
Layout: Flex row with space-between
- Left: Text content (vertical stack)
- Right: Avatar icon
  
States:
- Default: White background, subtle border, soft shadow
- Hover: Elevated shadow, slight lift, no gradient
- Click: Navigate to related section

Accent: Left-aligned colored border (optional)
Height: 100% of parent
```

### Content Cards
```
Header:
- Icon + Title (vertically centered)
- Optional: Count badge or tag
- Extra: Small secondary text

Body:
- Primary content area
- Scrollable if content exceeds bounds
- Consistent padding

Footer:
- Optional action buttons
- Secondary links/actions
```

### Modals
```
Header:
- Background: Light gradient (#f9fafb → #f3f4f6)
- Title: 16px, 700 weight, dark text
- Close button: Top right, subtle style

Content:
- Information blocks with left colored borders
- Consistent padding (12px)
- Clear visual separation

Footer:
- Buttons: Primary action (right), secondary (left)
- Standard ant-modal footer spacing
```

### Tables & Lists
```
Header Row:
- Background: #f9fafb
- Border: 2px solid #e5e7eb
- Font: 600 weight, small size

Data Rows:
- Padding: 12px 0
- Border: 1px solid #e5e7eb
- Hover: Background #f9fafb

Actions:
- Button group: Space-around
- Icon buttons for quick actions
- Link buttons for secondary actions
```

## Interaction Patterns

### Button States
```
Primary Button:
- Default: Gradient background (teal → cyan), text white
- Hover: Lifted shadow, slight lift transform
- Active: Deeper gradient
- Disabled: Opacity 0.6

Secondary Button:
- Default: Subtle border, transparent background
- Hover: Light background tint
- Active: Darker border and text

Text/Link Button:
- Default: Colored text, no background
- Hover: Slightly darker text, underline optional
```

### Card States
```
Default:
- White background
- Soft shadow
- Neutral borders

Hover:
- Same background
- Enhanced shadow
- 2px upward lift
- Subtle border brightening

Active/Selected:
- Light colored background tint
- Colored left border accent
- Maintained elevation
```

### Input Focus States
```
Unfocused:
- Subtle border (#e5e7eb)
- Normal background
- Placeholder text visible

Focused:
- Colored border (#0f766e)
- Light box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1)
- Cursor in field

Error:
- Red border (#dc2626)
- Red box-shadow
- Error message below
```

## Responsive Design

### Breakpoints
```
Mobile:  < 576px
Tablet:  576px - 992px  
Desktop: > 992px
Large:   > 1200px
```

### Mobile Optimizations
```
- Adjusted shadow system (lighter shadows)
- Maintained 12px border radius
- Touch-friendly button sizes (min 44px height)
- Simplified layouts
- Stack columns vertically
```

## Professional Design Principles Applied

✅ **Consistency**: Unified spacing, colors, typography
✅ **Hierarchy**: Clear visual priorities using size, weight, color
✅ **Proximity**: Related elements grouped together
✅ **Contrast**: Sufficient text/background contrast (WCAG AA+)
✅ **Whitespace**: Generous spacing for clean appearance
✅ **Alignment**: Grid-based layout system
✅ **Color**: Meaningful color usage (not decorative)
✅ **Typography**: Readable sizes and weights
✅ **Interaction**: Clear, responsive feedback
✅ **Accessibility**: Keyboard navigation, screen reader support

## Implementation Notes

All styles are now centralized in:
- `StaffDashboard.module.css` - Global component styles
- Inline styles - Component-specific interactive states

The design maintains full backward compatibility while providing:
- Better visual appeal
- Improved user experience
- Professional appearance
- Consistency across components
- Smooth, modern animations
- Responsive design
