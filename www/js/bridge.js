class TikTokGameBridge {
  constructor(iframeElement, onLogCallback, onStatusCallback) {
    this.iframe = iframeElement;
    this.onLog = onLogCallback || (() => {});
    this.onStatus = onStatusCallback || (() => {});
    this.ws = null;
    this.rules = this.loadRules();
  }

  loadRules() {
    const saved = localStorage.getItem('tiktok_bridge_rules');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [
      { id: 1, triggerType: 'chat', match: 'merah', actionType: 'CUSTOM', value: 'PULL_LEFT' },
      { id: 2, triggerType: 'chat', match: 'biru', actionType: 'CUSTOM', value: 'PULL_RIGHT' },
      { id: 3, triggerType: 'gift', match: 'Rose', actionType: 'CUSTOM', value: 'BOOST_LEFT' },
      { id: 4, triggerType: 'gift', match: 'Lion', actionType: 'CUSTOM', value: 'BOOST_RIGHT' },
      { id: 5, triggerType: 'like', match: '1', actionType: 'KEY', value: 'Space' }
    ];
  }

  saveRules() {
    localStorage.setItem('tiktok_bridge_rules', JSON.stringify(this.rules));
  }

  addRule(rule) {
    this.rules.push({ id: Date.now(), ...rule });
    this.saveRules();
  }

  removeRule(id) {
    this.rules = this.rules.filter(r => r.id !== id);
    this.saveRules();
  }

  connectLive(wsUrl) {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    try {
      this.onStatus('CONNECTING');
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.onStatus('CONNECTED');
        this.onLog('Terhubung ke server bridge: ' + wsUrl);
      };

      this.ws.onmessage = (msg) => {
        try {
          const payload = JSON.parse(msg.data);
          this.processEvent(payload);
        } catch (err) {
          this.onLog('Format data WebSocket tidak valid');
        }
      };

      this.ws.onerror = () => {
        this.onStatus('ERROR');
        this.onLog('Gagal terhubung ke ' + wsUrl);
      };

      this.ws.onclose = () => {
        this.onStatus('OFFLINE');
      };
    } catch (e) {
      this.onStatus('ERROR');
    }
  }

  disconnectLive() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.onStatus('OFFLINE');
  }

  processEvent(eventData) {
    const user = eventData.nickname || 'Penonton';
    if (eventData.type === 'chat') {
      this.onLog(`💬 ${user}: ${eventData.comment}`);
    } else if (eventData.type === 'gift') {
      this.onLog(`🎁 ${user} mengirim ${eventData.giftName} (x${eventData.repeatCount || 1})`);
    } else if (eventData.type === 'like') {
      this.onLog(`❤️ ${user} mengirim ${eventData.likeCount || 1} Like`);
    }

    // Kirim data mentah ke game bawaan
    if (this.iframe && this.iframe.contentWindow) {
      this.iframe.contentWindow.postMessage({
        source: 'TIKTOK_BRIDGE',
        data: eventData
      }, '*');
    }

    // Cocokkan dengan aturan mapping manual
    this.rules.forEach((rule) => {
      let isMatch = false;
      const target = (rule.match || '').toLowerCase().trim();

      if (rule.triggerType === 'gift' && eventData.type === 'gift') {
        isMatch = !target || (eventData.giftName || '').toLowerCase().includes(target);
      } else if (rule.triggerType === 'chat' && eventData.type === 'chat') {
        isMatch = !target || (eventData.comment || '').toLowerCase().includes(target);
      } else if (rule.triggerType === 'like' && eventData.type === 'like') {
        isMatch = true;
      }

      if (isMatch) {
        this.executeAction(rule, eventData);
      }
    });
  }

  executeAction(rule, eventData) {
    if (!this.iframe || !this.iframe.contentWindow) return;
    const win = this.iframe.contentWindow;

    if (rule.actionType === 'CUSTOM') {
      win.postMessage({
        source: 'TIKTOK_ACTION',
        action: rule.value,
        user: eventData.nickname || 'Tester',
        raw: eventData
      }, '*');
    } else if (rule.actionType === 'KEY') {
      const key = rule.value || 'Space';
      try {
        win.document.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true }));
        setTimeout(() => {
          win.document.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, bubbles: true }));
        }, 80);
      } catch (e) {
        // Fallback jika game eksternal lintas-domain
        win.postMessage({ source: 'TIKTOK_KEY', key }, '*');
      }
    }
  }

  loadBuiltInGame(path) {
    this.iframe.removeAttribute('srcdoc');
    this.iframe.src = path;
    this.onLog('Memuat game bawaan: ' + path);
  }

  importLocalHtml(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      this.iframe.removeAttribute('src');
      this.iframe.srcdoc = e.target.result;
      this.onLog('Berhasil impor game lokal: ' + file.name);
    };
    reader.readAsText(file);
  }

  importExternalUrl(url) {
    if (!url.startsWith('http')) url = 'https://' + url;
    this.iframe.removeAttribute('srcdoc');
    this.iframe.src = url;
    this.onLog('Memuat game dari URL: ' + url);
  }
}
