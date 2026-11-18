class TikTokGameBridge {
  constructor(iframeElement) {
    this.iframe = iframeElement;
    this.ws = null;
    // Aturan mapping yang bisa diubah-ubah user secara manual di UI
    this.rules = [
      { triggerType: 'gift', match: 'Rose', actionType: 'KEY', key: 'Space', customEvent: 'BOOST_SPEED' },
      { triggerType: 'chat', match: 'kiri', actionType: 'KEY', key: 'ArrowLeft', customEvent: 'TEAM_LEFT' },
      { triggerType: 'chat', match: 'kanan', actionType: 'KEY', key: 'ArrowRight', customEvent: 'TEAM_RIGHT' },
      { triggerType: 'like', match: '10', actionType: 'CUSTOM', customEvent: 'HEAL_PLAYER' }
    ];
  }

  // 1. Koneksi ke Server Bridge TikTok Live (Termux / Cloud)
  connectLive(wsUrl) {
    if (this.ws) this.ws.close();
    this.ws = new WebSocket(wsUrl);
    this.ws.onmessage = (msg) => {
      const payload = JSON.parse(msg.data);
      this.processEvent(payload);
    };
  }

  // 2. Dipanggil oleh WebSocket Live MAUPUN Tombol Simulator Manual
  processEvent(eventData) {
    // Kirim data mentah ke game bawaan via postMessage
    if (this.iframe && this.iframe.contentWindow) {
      this.iframe.contentWindow.postMessage({
        source: 'TIKTOK_BRIDGE',
        data: eventData
      }, '*');
    }

    // Cek aturan mapping manual untuk game umum
    this.rules.forEach((rule) => {
      const isMatch =
        (rule.triggerType === 'gift' && eventData.type === 'gift' && eventData.giftName.toLowerCase() === rule.match.toLowerCase()) ||
        (rule.triggerType === 'chat' && eventData.type === 'chat' && eventData.comment.toLowerCase().includes(rule.match.toLowerCase())) ||
        (rule.triggerType === 'like' && eventData.type === 'like');

      if (isMatch) {
        this.executeGameAction(rule, eventData);
      }
    });
  }

  // 3. Eksekusi aksi ke dalam game yang sedang aktif
  executeGameAction(rule, eventData) {
    if (!this.iframe || !this.iframe.contentWindow) return;

    if (rule.actionType === 'KEY') {
      const keyEvent = new KeyboardEvent('keydown', { key: rule.key, code: rule.key, bubbles: true });
      this.iframe.contentWindow.document.dispatchEvent(keyEvent);
    }

    this.iframe.contentWindow.postMessage({
      source: 'TIKTOK_ACTION',
      action: rule.customEvent,
      user: eventData.nickname || 'Tester'
    }, '*');
  }

  // 4. Impor game dari file HTML lokal di HP
  importLocalGame(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const blob = new Blob([e.target.result], { type: 'text/html' });
      this.iframe.src = URL.createObjectURL(blob);
    };
    reader.readAsText(file);
  }
}
