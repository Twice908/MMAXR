# AR testing

## Spatial panel checklist

1. Enter AR and confirm the atom remains world-fixed while four glass panels
   appear around it; mission is expanded and side panels start compact.
2. Tap a side-panel header to expand and collapse it. Tap panel controls and
   confirm the corresponding lesson or narration control responds once.
3. Confirm **Exit AR**, **Settings**, **Reset view**, and **Show/Hide panel**
   remain usable. The Settings fallback should open the existing DOM controls.
   Rotate or scale the atom and verify the panels do not move with it.
4. Confirm the compact Settings panel opens, its sound/captions/speed controls
   reflect the existing DOM values, and replay/reset/panel visibility work.
   Confirm edge hints for off-screen panels are non-interactive in AR.
5. Exit and re-enter twice; no old panels or hints should remain.
6. If panel creation or text drawing fails, confirm the session continues and
   the existing DOM panels remain visible.
7. Recheck ordinary screen mode after exiting AR; its existing layout should
   remain unchanged.
