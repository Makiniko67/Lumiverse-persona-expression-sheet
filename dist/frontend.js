// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────
function bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}
const ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="7" cy="8.5" r="1" fill="currentColor"/>
  <circle cx="13" cy="8.5" r="1" fill="currentColor"/>
  <path d="M6.5 12.5C7.5 13.8 12.5 13.8 13.5 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;
// ──────────────────────────────────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────────────────────────────────
export function setup(ctx) {
    let state = null;
    let widget = null;
    let widgetImg = null;
    // ── Styles ──────────────────────────────────────────────────────────────
    const removeStyle = ctx.dom.addStyle(`
    .pes-empty {
      padding: 16px;
      color: var(--lumiverse-text-muted, #999);
      font-size: 13px;
      line-height: 1.5;
    }
    .pes-header {
      padding: 12px 16px 4px;
      font-size: 13px;
      font-weight: 600;
      color: var(--lumiverse-text, #eee);
    }
    .pes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
      gap: 10px;
      padding: 12px 16px;
    }
    .pes-card {
      position: relative;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--lumiverse-border, #333);
      border-radius: var(--lumiverse-radius, 8px);
      background: var(--lumiverse-fill-subtle, #1c1c1f);
      overflow: hidden;
      cursor: pointer;
      transition: border-color 0.15s ease;
    }
    .pes-card-active {
      border-color: var(--lumiverse-accent, #7c6cff);
      box-shadow: 0 0 0 1px var(--lumiverse-accent, #7c6cff);
    }
    .pes-card-image {
      width: 100%;
      aspect-ratio: 1 / 1;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--lumiverse-fill, #141416);
      color: var(--lumiverse-text-dim, #666);
      font-size: 28px;
      overflow: hidden;
    }
    .pes-card-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .pes-card-label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 8px;
      gap: 4px;
    }
    .pes-card-label {
      font-size: 11.5px;
      color: var(--lumiverse-text, #eee);
      text-transform: capitalize;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pes-card-menu {
      flex-shrink: 0;
      border: none;
      background: transparent;
      color: var(--lumiverse-text-muted, #999);
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 4px;
    }
    .pes-card-menu:hover {
      background: var(--lumiverse-fill, #141416);
      color: var(--lumiverse-text, #eee);
    }
    .pes-add-card {
      align-items: center;
      justify-content: center;
      aspect-ratio: 1 / 1.18;
      color: var(--lumiverse-text-muted, #999);
      font-size: 12px;
      text-align: center;
      padding: 8px;
      border-style: dashed;
    }
    .pes-add-card:hover {
      color: var(--lumiverse-text, #eee);
      border-color: var(--lumiverse-accent, #7c6cff);
    }
    .pes-modal-input {
      width: 100%;
      padding: 8px 10px;
      margin-bottom: 12px;
      background: var(--lumiverse-fill, #141416);
      border: 1px solid var(--lumiverse-border, #333);
      border-radius: var(--lumiverse-radius, 8px);
      color: var(--lumiverse-text, #eee);
      font-size: 13px;
      box-sizing: border-box;
    }
    .pes-modal-btn {
      width: 100%;
      padding: 9px 10px;
      background: var(--lumiverse-accent, #7c6cff);
      border: none;
      border-radius: var(--lumiverse-radius, 8px);
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .pes-picker-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: var(--lumiverse-radius, 8px);
      cursor: pointer;
    }
    .pes-picker-row:hover {
      background: var(--lumiverse-fill-subtle, #1c1c1f);
    }
    .pes-picker-thumb {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      object-fit: cover;
      background: var(--lumiverse-fill, #141416);
      flex-shrink: 0;
    }
    .pes-picker-label {
      font-size: 13px;
      color: var(--lumiverse-text, #eee);
      text-transform: capitalize;
    }
    .pes-size-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 16px 10px;
    }
    .pes-size-row label {
      font-size: 11.5px;
      color: var(--lumiverse-text-muted, #999);
      flex-shrink: 0;
      white-space: nowrap;
    }
    .pes-size-row input[type="range"] {
      flex: 1;
      accent-color: var(--lumiverse-accent, #7c6cff);
    }
    .pes-size-row .pes-size-value {
      font-size: 11.5px;
      color: var(--lumiverse-text, #eee);
      width: 38px;
      text-align: right;
      flex-shrink: 0;
    }
    .pes-toggle-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 0 16px 12px;
    }
    .pes-toggle-row input[type="checkbox"] {
      margin-top: 2px;
      accent-color: var(--lumiverse-accent, #7c6cff);
      flex-shrink: 0;
    }
    .pes-toggle-row label {
      font-size: 11.5px;
      color: var(--lumiverse-text-muted, #999);
      line-height: 1.4;
    }
    .pes-widget {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
    }
    .pes-widget img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: none;
    }
    .pes-widget img.pes-widget-visible {
      display: block;
    }
  `);
    // ── Drawer tab ──────────────────────────────────────────────────────────
    const tab = ctx.ui.registerDrawerTab({
        id: 'expressions',
        title: 'Persona Expressions',
        shortName: 'Faces',
        description: 'Upload and manage your persona\u2019s expression art',
        keywords: ['expression', 'persona', 'avatar', 'mood', 'sprite'],
        headerTitle: 'Persona Expressions',
        iconSvg: ICON_SVG,
    });
    // ── Float widget (optional — needs ui_panels) ──────────────────────────
    let currentWidgetSize = 96;
    let lastWidgetPosition = { x: 24, y: 120 };
    function applyWidgetSize(size) {
        if (!widget)
            return;
        // Belt-and-suspenders: the constructor's width/height options should
        // size the container, but percentage CSS inside only resolves
        // correctly if that container actually ends up with a real pixel
        // size. Setting it explicitly here can't be wrong either way.
        widget.root.style.width = `${size}px`;
        widget.root.style.height = `${size}px`;
    }
    function ensureWidget(size) {
        if (widget && currentWidgetSize === size)
            return widget;
        if (widget) {
            // No resize() in the API — recreate at the new size, but keep
            // wherever the user last dragged it instead of snapping back.
            try {
                lastWidgetPosition = widget.getPosition();
            }
            catch {
                // ignore — fall back to the last known position
            }
            widget.destroy();
            widget = null;
        }
        currentWidgetSize = size;
        try {
            widget = ctx.ui.createFloatWidget({
                width: size,
                height: size,
                initialPosition: lastWidgetPosition,
                snapToEdge: true,
                tooltip: 'Persona expression — click to open the sheet',
                chromeless: true,
            });
            widget.root.innerHTML = '<div class="pes-widget"><img class="pes-widget-img" alt="Persona expression" /></div>';
            widgetImg = widget.root.querySelector('.pes-widget-img');
            widget.root.addEventListener('click', () => tab.activate());
            widget.onDragEnd((pos) => {
                lastWidgetPosition = pos;
            });
            applyWidgetSize(size);
        }
        catch (err) {
            console.warn('[persona-expression-sheet] Float widget unavailable (grant "ui_panels" to enable it).', err);
        }
        return widget;
    }
    function updateWidget(url, size) {
        const w = ensureWidget(size);
        if (!w || !widgetImg)
            return;
        if (url) {
            widgetImg.src = url;
            widgetImg.classList.add('pes-widget-visible');
            w.setVisible(true);
        }
        else {
            widgetImg.classList.remove('pes-widget-visible');
            w.setVisible(false);
        }
    }
    // ── Upload flow ─────────────────────────────────────────────────────────
    async function pickAndUpload(label) {
        let files;
        try {
            files = await ctx.uploads.pickFile({ accept: ['image/*'], multiple: false, maxSizeBytes: 5 * 1024 * 1024 });
        }
        catch {
            return; // user cancelled or file too large — picker already surfaces that
        }
        const file = files?.[0];
        if (!file)
            return;
        ctx.sendToBackend({
            type: 'upload_expression',
            label,
            filename: file.name,
            mimeType: file.mimeType,
            bytesBase64: bytesToBase64(file.bytes),
        });
    }
    function setActive(label) {
        ctx.sendToBackend({ type: 'set_active', label });
    }
    function removeLabel(label) {
        ctx.sendToBackend({ type: 'remove_label', label });
    }
    async function addNewExpression() {
        const modal = ctx.ui.showModal({ title: 'New Expression', width: 340 });
        const input = document.createElement('input');
        input.className = 'pes-modal-input';
        input.placeholder = 'e.g. excited, shy, determined\u2026';
        input.maxLength = 32;
        const button = document.createElement('button');
        button.className = 'pes-modal-btn';
        button.textContent = 'Choose Image & Save';
        modal.root.append(input, button);
        input.focus();
        const submit = async () => {
            const label = input.value.trim().toLowerCase();
            if (!label)
                return;
            modal.dismiss();
            ctx.sendToBackend({ type: 'add_label', label });
            await pickAndUpload(label);
        };
        button.addEventListener('click', submit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')
                submit();
        });
    }
    // ── Card menu (replace / remove) ───────────────────────────────────────
    async function showCardMenu(label, hasSlot, evt) {
        const items = hasSlot
            ? [
                { key: 'replace', label: 'Replace image' },
                { key: 'remove', label: 'Remove', danger: true },
            ]
            : [{ key: 'remove', label: 'Remove label', danger: true }];
        const { selectedKey } = await ctx.ui.showContextMenu({
            position: { x: evt.clientX, y: evt.clientY },
            items,
        });
        if (selectedKey === 'replace') {
            await pickAndUpload(label);
        }
        else if (selectedKey === 'remove') {
            const { confirmed } = await ctx.ui.showConfirm({
                title: 'Remove expression',
                message: `Remove the "${label}" expression? This deletes the uploaded image too.`,
                variant: 'danger',
                confirmLabel: 'Remove',
            });
            if (confirmed)
                removeLabel(label);
        }
    }
    // ── Quick picker modal (used by the input bar action) ──────────────────
    function showQuickPicker() {
        if (!state?.data)
            return;
        const data = state.data;
        const modal = ctx.ui.showModal({ title: 'Set Persona Expression', width: 320, maxHeight: 420 });
        const labelsWithImages = data.labels.filter((l) => data.slots[l]);
        if (labelsWithImages.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'pes-empty';
            empty.textContent = 'No expressions uploaded yet. Open the Persona Expressions tab to add some.';
            modal.root.appendChild(empty);
            return;
        }
        for (const label of labelsWithImages) {
            const slot = data.slots[label];
            const row = document.createElement('div');
            row.className = 'pes-picker-row';
            const thumb = document.createElement('img');
            thumb.className = 'pes-picker-thumb';
            thumb.src = slot.url;
            thumb.alt = label;
            const text = document.createElement('span');
            text.className = 'pes-picker-label';
            text.textContent = label;
            row.append(thumb, text);
            row.addEventListener('click', () => {
                setActive(label);
                modal.dismiss();
            });
            modal.root.appendChild(row);
        }
    }
    // ── Card + grid rendering ───────────────────────────────────────────────
    function buildCard(label, slot, isActive) {
        const card = document.createElement('div');
        card.className = 'pes-card' + (isActive ? ' pes-card-active' : '');
        const imgWrap = document.createElement('div');
        imgWrap.className = 'pes-card-image';
        if (slot) {
            const img = document.createElement('img');
            img.src = slot.url;
            img.alt = label;
            imgWrap.appendChild(img);
        }
        else {
            imgWrap.textContent = '+';
        }
        imgWrap.addEventListener('click', () => {
            if (slot) {
                setActive(label);
            }
            else {
                void pickAndUpload(label);
            }
        });
        const labelRow = document.createElement('div');
        labelRow.className = 'pes-card-label-row';
        const labelEl = document.createElement('span');
        labelEl.className = 'pes-card-label';
        labelEl.textContent = label;
        const menuBtn = document.createElement('button');
        menuBtn.className = 'pes-card-menu';
        menuBtn.textContent = '\u22EF';
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            void showCardMenu(label, !!slot, e);
        });
        labelRow.append(labelEl, menuBtn);
        card.append(imgWrap, labelRow);
        return card;
    }
    function render() {
        tab.root.innerHTML = '';
        if (state?.permissionsMissing) {
            const msg = document.createElement('p');
            msg.className = 'pes-empty';
            msg.textContent =
                'Grant the "Personas" and "Images" permissions for Persona Expression Sheet in the Extensions panel to use this tab.';
            tab.root.appendChild(msg);
            return;
        }
        if (!state || !state.personaId) {
            const msg = document.createElement('p');
            msg.className = 'pes-empty';
            msg.textContent = 'No active persona selected. Pick a persona in Lumiverse, then reopen this tab.';
            tab.root.appendChild(msg);
            return;
        }
        const header = document.createElement('div');
        header.className = 'pes-header';
        header.textContent = `Expressions for ${state.personaName ?? 'this persona'}`;
        tab.root.appendChild(header);
        const sizeRow = document.createElement('div');
        sizeRow.className = 'pes-size-row';
        const sizeLabel = document.createElement('label');
        sizeLabel.textContent = 'Widget size';
        const sizeSlider = document.createElement('input');
        sizeSlider.type = 'range';
        sizeSlider.min = '48';
        sizeSlider.max = '600';
        sizeSlider.step = '8';
        sizeSlider.value = String(state.widgetSize);
        const sizeValue = document.createElement('span');
        sizeValue.className = 'pes-size-value';
        sizeValue.textContent = `${state.widgetSize}px`;
        let sizeDebounce = null;
        sizeSlider.addEventListener('input', () => {
            const size = Number(sizeSlider.value);
            sizeValue.textContent = `${size}px`;
            // Live-preview locally without waiting on the round trip...
            const activeSlot = state?.data?.activeLabel ? state.data.slots[state.data.activeLabel] : null;
            updateWidget(activeSlot?.url ?? null, size);
            // ...and persist it, debounced so dragging doesn't spam the backend.
            if (sizeDebounce)
                clearTimeout(sizeDebounce);
            sizeDebounce = setTimeout(() => {
                ctx.sendToBackend({ type: 'set_widget_size', size });
            }, 250);
        });
        sizeRow.append(sizeLabel, sizeSlider, sizeValue);
        tab.root.appendChild(sizeRow);
        const toggleRow = document.createElement('div');
        toggleRow.className = 'pes-toggle-row';
        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.id = 'pes-scan-char';
        toggleInput.checked = state.scanCharacterMessages;
        const toggleLabel = document.createElement('label');
        toggleLabel.htmlFor = 'pes-scan-char';
        toggleLabel.textContent =
            "Also react to the character's messages — turn this on if your character writes your persona's actions for you (narrator-style play).";
        toggleInput.addEventListener('change', () => {
            ctx.sendToBackend({ type: 'set_scan_character_messages', enabled: toggleInput.checked });
        });
        toggleRow.append(toggleInput, toggleLabel);
        tab.root.appendChild(toggleRow);
        const grid = document.createElement('div');
        grid.className = 'pes-grid';
        const labels = state.data?.labels ?? [];
        for (const label of labels) {
            const slot = state.data?.slots[label];
            const isActive = state.data?.activeLabel === label;
            grid.appendChild(buildCard(label, slot, isActive));
        }
        const addTile = document.createElement('div');
        addTile.className = 'pes-card pes-add-card';
        addTile.textContent = '+ New expression';
        addTile.addEventListener('click', () => void addNewExpression());
        grid.appendChild(addTile);
        tab.root.appendChild(grid);
    }
    // ── Input bar quick action ─────────────────────────────────────────────
    const inputAction = ctx.ui.registerInputBarAction({
        id: 'set-expression',
        label: 'Set Persona Expression',
        iconSvg: ICON_SVG,
    });
    const unsubInputAction = inputAction.onClick(() => showQuickPicker());
    // ── Backend wiring ──────────────────────────────────────────────────────
    const unsubBackend = ctx.onBackendMessage((payload) => {
        if (payload.type === 'state') {
            state = payload;
            render();
            const activeSlot = state.data?.activeLabel ? state.data.slots[state.data.activeLabel] : null;
            updateWidget(activeSlot?.url ?? null, state.widgetSize);
        }
        else if (payload.type === 'active_changed') {
            if (state?.data) {
                state.data.activeLabel = payload.label;
            }
            updateWidget(payload.slot?.url ?? null, state?.widgetSize ?? 96);
            render();
        }
        else if (payload.type === 'refetch') {
            ctx.sendToBackend({ type: 'get_state' });
        }
    });
    tab.onActivate(() => {
        ctx.sendToBackend({ type: 'get_state' });
    });
    // Initial load
    ctx.sendToBackend({ type: 'get_state' });
    // ── Teardown ─────────────────────────────────────────────────────────────
    return () => {
        unsubBackend();
        unsubInputAction();
        inputAction.destroy();
        tab.destroy();
        widget?.destroy();
        removeStyle();
        ctx.dom.cleanup();
    };
}
