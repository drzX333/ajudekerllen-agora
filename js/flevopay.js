/**
 * Flevo Pay PIX Integration - Amor Vivo
 * Gera QR Code PIX imediato ao clicar em qualquer valor de doação.
 */

(function () {
    const FLEVO_SECRET_KEY = "sk_fdc7594e7eb1486ea3e282cc0a8249b55f1e0270b6844a8f506060f75d529968";
    let activeTransaction = null;
    let pollInterval = null;
    let countdownInterval = null;
    let currentAmountInCents = 3000;

    // Utilitário para formatar centavos em R$ (ex: 5000 -> "R$ 50,00")
    function formatCentsToBRL(cents) {
        const val = (cents / 100).toFixed(2).replace('.', ',');
        return 'R$ ' + val.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    // Utilitário para parsear texto para centavos (ex: "R$ 70,00" -> 7000)
    function parseTextToCents(text) {
        if (!text) return 3000;
        const numbers = text.replace(/\D/g, '');
        if (!numbers) return 3000;
        
        // Se já tiver centavos implícitos ou for valor inteiro
        if (text.includes(',') || text.includes('.')) {
            // Se tem vírgula (formato brasileiro padrão R$ 70,00)
            if (text.includes(',')) {
                const parts = text.split(',');
                const intPart = parts[0].replace(/\D/g, '') || '0';
                const decPart = (parts[1].replace(/\D/g, '') + '00').substring(0, 2);
                return parseInt(intPart + decPart, 10);
            }
        }
        
        // Se for número direto como 100 ou 50
        const n = parseInt(numbers, 10);
        if (n < 500) {
            return n * 100; // 50 -> 5000 centavos
        }
        return n;
    }

    // Injeta o HTML do Modal PIX no DOM
    function injectPixModal() {
        if (document.getElementById('flevoPixModal')) return;

        const modalHtml = `
        <div id="flevoPixModal" class="flevo-modal" style="display:none;">
            <div class="flevo-modal-backdrop" onclick="window.FlevoPay.closeModal()"></div>
            <div class="flevo-modal-dialog">
                <button class="flevo-modal-close" onclick="window.FlevoPay.closeModal()" aria-label="Fechar">&times;</button>
                
                <!-- ESTADO: CARREGANDO -->
                <div id="flevoStateLoading" class="flevo-state" style="display:none;">
                    <div class="flevo-spinner"></div>
                    <h3 class="flevo-title">Gerando Pix Seguro...</h3>
                    <p class="flevo-desc">Conectando ao sistema bancário para gerar seu QR Code oficial.</p>
                </div>

                <!-- ESTADO: QR CODE GERADO -->
                <div id="flevoStateReady" class="flevo-state" style="display:none;">
                    <div class="flevo-header">
                        <span class="flevo-badge-pix">
                            <svg width="14" height="14" viewBox="0 0 512 512" fill="#24CA68"><path d="M242.4 292.5C247.8 287.1 257 287.1 262.4 292.5L339.5 369.6C353.7 383.7 372.6 391.5 392.6 391.5H407.7L330.6 314.4C316.4 300.2 316.4 277.3 330.6 263.1L483.9 109.8C498 95.66 505.8 76.78 505.8 56.76V41.64L428.7 118.7C414.6 132.9 391.7 132.9 377.5 118.7L300.4 41.64C286.3 27.5 267.4 19.66 247.4 19.66H232.3L309.4 96.76C323.6 110.9 323.6 133.8 309.4 147.9L156.1 301.2C142 315.3 134.2 334.2 134.2 354.2V369.4L211.3 292.3C219.7 283.8 233.9 283.8 242.4 292.5z"/></svg>
                            PAGAMENTO INSTANTÂNEO PIX
                        </span>
                        <h2 class="flevo-modal-title">Ajude a Kerllen</h2>
                        <div class="flevo-amount-container">
                            <span class="flevo-amount-label">Valor da Doação:</span>
                            <span class="flevo-amount-val" id="flevoDisplayAmount">R$ 0,00</span>
                        </div>
                    </div>

                    <!-- Status animado -->
                    <div class="flevo-status-bar">
                        <div class="flevo-pulse-dot"></div>
                        <span>Aguardando confirmação do pagamento...</span>
                    </div>

                    <!-- QR Code Display -->
                    <div class="flevo-qrcode-wrapper">
                        <div id="flevoQrCodeContainer" class="flevo-qrcode-box"></div>
                        <div class="flevo-timer-tag">
                            <span>Expira em: <strong id="flevoTimerText">15:00</strong></span>
                        </div>
                    </div>

                    <!-- Pix Copia e Cola -->
                    <div class="flevo-copy-section">
                        <label class="flevo-copy-label">Pix Copia e Cola:</label>
                        <div class="flevo-copy-input-group">
                            <input type="text" id="flevoPixCodeInput" readonly value="" />
                            <button type="button" id="flevoBtnCopy" class="flevo-btn-copy" onclick="window.FlevoPay.copyPixCode()">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                <span>Copiar Código Pix</span>
                            </button>
                        </div>
                    </div>

                    <!-- Instruções -->
                    <div class="flevo-instructions">
                        <div class="flevo-step">
                            <span class="flevo-step-num">1</span>
                            <span>Abra o app do seu banco ou carteira digital</span>
                        </div>
                        <div class="flevo-step">
                            <span class="flevo-step-num">2</span>
                            <span>Escolha a opção <strong>Pix</strong> e selecione <strong>Pagar com QR Code</strong> ou <strong>Pix Copia e Cola</strong></span>
                        </div>
                        <div class="flevo-step">
                            <span class="flevo-step-num">3</span>
                            <span>Escaneie ou cole o código e confirme o pagamento</span>
                        </div>
                    </div>

                    <!-- Identificar doação opcional -->
                    <details class="flevo-details-donor">
                        <summary>Deseja identificar sua doação? (Opcional)</summary>
                        <div class="flevo-donor-form">
                            <input type="text" id="flevoDonorName" placeholder="Seu Nome Completo" />
                            <input type="text" id="flevoDonorCpf" placeholder="Seu CPF (apenas números)" maxlength="14" />
                            <button type="button" class="flevo-btn-update-donor" onclick="window.FlevoPay.regenerateWithDonorInfo()">Atualizar Pix com meus dados</button>
                        </div>
                    </details>

                    <button type="button" class="flevo-btn-check-now" onclick="window.FlevoPay.checkStatusNow()">
                        Já realizei o pagamento
                    </button>
                </div>

                <!-- ESTADO: SUCESSO / CONFIRMADO -->
                <div id="flevoStateSuccess" class="flevo-state" style="display:none;">
                    <div class="flevo-success-icon">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#24CA68" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                    </div>
                    <h2 class="flevo-success-title">Doação Confirmada! 🎉</h2>
                    <p class="flevo-success-desc">
                        Muito obrigado por seu apoio! Sua contribuição de <strong id="flevoSuccessAmount"></strong> para a pequena Kerllen faz toda a diferença para o tratamento e adaptações que ela precisa.
                    </p>
                    <div class="flevo-success-badge">Pagamento Aprovado com Sucesso</div>
                    <button type="button" class="flevo-btn-close-final" onclick="window.FlevoPay.closeModal()">
                        Fechar
                    </button>
                </div>

                <!-- ESTADO: ERRO -->
                <div id="flevoStateError" class="flevo-state" style="display:none;">
                    <div class="flevo-error-icon">⚠️</div>
                    <h3 class="flevo-title">Não foi possível gerar o Pix</h3>
                    <p class="flevo-desc" id="flevoErrorMessage">Houve uma instabilidade momentânea. Por favor, tente novamente.</p>
                    <button type="button" class="flevo-btn-retry" onclick="window.FlevoPay.retryGeneration()">
                        Tentar Novamente
                    </button>
                </div>

            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        injectPixModalStyles();
    }

    // Injeta os estilos CSS do Modal
    function injectPixModalStyles() {
        if (document.getElementById('flevoPixModalStyles')) return;

        const css = `
        .flevo-modal {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            z-index: 9999999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
            font-family: 'Montserrat', system-ui, -apple-system, sans-serif;
            box-sizing: border-box;
        }
        .flevo-modal-backdrop {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(15, 23, 42, 0.75);
            backdrop-filter: blur(4px);
        }
        .flevo-modal-dialog {
            position: relative;
            background: #ffffff;
            width: 100%;
            max-width: 460px;
            max-height: 90vh;
            overflow-y: auto;
            border-radius: 20px;
            padding: 24px 20px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
            box-sizing: border-box;
            animation: flevoFadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes flevoFadeInUp {
            from { opacity: 0; transform: translateY(20px) scale(0.97); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .flevo-modal-close {
            position: absolute;
            top: 14px;
            right: 14px;
            width: 34px;
            height: 34px;
            border-radius: 50%;
            border: 1px solid #e2e8f0;
            background: #f8fafc;
            color: #64748b;
            font-size: 22px;
            line-height: 1;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            z-index: 2;
        }
        .flevo-modal-close:hover {
            background: #e2e8f0;
            color: #0f172a;
        }
        .flevo-header {
            text-align: center;
            margin-bottom: 12px;
        }
        .flevo-badge-pix {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: #ecfdf5;
            color: #059669;
            font-size: 0.75rem;
            font-weight: 700;
            padding: 4px 10px;
            border-radius: 9999px;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
            border: 1px solid #a7f3d0;
        }
        .flevo-modal-title {
            margin: 0 0 6px 0;
            font-size: 1.35rem;
            font-weight: 800;
            color: #1e293b;
        }
        .flevo-amount-container {
            display: flex;
            align-items: baseline;
            justify-content: center;
            gap: 8px;
            margin-top: 4px;
        }
        .flevo-amount-label {
            font-size: 0.9rem;
            color: #64748b;
        }
        .flevo-amount-val {
            font-size: 1.7rem;
            font-weight: 800;
            color: #24CA68;
        }
        .flevo-status-bar {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            border-radius: 10px;
            padding: 8px 12px;
            margin-bottom: 16px;
            font-size: 0.85rem;
            font-weight: 600;
            color: #166534;
        }
        .flevo-pulse-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #22c55e;
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
            animation: flevoPulse 1.6s infinite;
        }
        @keyframes flevoPulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
        .flevo-qrcode-wrapper {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-bottom: 16px;
        }
        .flevo-qrcode-box {
            background: #ffffff;
            padding: 12px;
            border-radius: 16px;
            border: 2px solid #e2e8f0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 210px;
            min-height: 210px;
        }
        .flevo-qrcode-box canvas,
        .flevo-qrcode-box img {
            max-width: 200px !important;
            max-height: 200px !important;
            display: block;
        }
        .flevo-timer-tag {
            margin-top: 8px;
            font-size: 0.8rem;
            color: #64748b;
        }
        .flevo-timer-tag strong {
            color: #e11d48;
        }
        .flevo-copy-section {
            margin-bottom: 16px;
        }
        .flevo-copy-label {
            display: block;
            font-size: 0.85rem;
            font-weight: 600;
            color: #334155;
            margin-bottom: 6px;
        }
        .flevo-copy-input-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .flevo-copy-input-group input {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            font-size: 0.8rem;
            font-family: monospace;
            background: #f8fafc;
            color: #475569;
            box-sizing: border-box;
            outline: none;
        }
        .flevo-btn-copy {
            width: 100%;
            padding: 14px;
            background: #24CA68;
            color: #ffffff;
            border: none;
            border-radius: 10px;
            font-size: 1rem;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(36, 202, 104, 0.3);
            transition: all 0.2s;
        }
        .flevo-btn-copy:hover {
            background: #1eb95d;
            transform: translateY(-1px);
        }
        .flevo-btn-copy.copied {
            background: #0f172a !important;
            color: #ffffff !important;
            box-shadow: none !important;
        }
        .flevo-instructions {
            background: #f8fafc;
            border-radius: 12px;
            padding: 12px;
            margin-bottom: 14px;
            border: 1px solid #e2e8f0;
        }
        .flevo-step {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            font-size: 0.82rem;
            color: #475569;
            margin-bottom: 8px;
            line-height: 1.4;
        }
        .flevo-step:last-child { margin-bottom: 0; }
        .flevo-step-num {
            background: #e2e8f0;
            color: #1e293b;
            font-weight: 700;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.75rem;
            flex-shrink: 0;
        }
        .flevo-details-donor {
            margin-bottom: 12px;
            font-size: 0.85rem;
            color: #64748b;
        }
        .flevo-details-donor summary {
            cursor: pointer;
            color: #0284c7;
            font-weight: 600;
        }
        .flevo-donor-form {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-top: 10px;
            padding: 10px;
            background: #f1f5f9;
            border-radius: 8px;
        }
        .flevo-donor-form input {
            padding: 8px 10px;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            font-size: 0.85rem;
            box-sizing: border-box;
        }
        .flevo-btn-update-donor {
            padding: 8px;
            background: #0284c7;
            color: #fff;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            font-size: 0.8rem;
            cursor: pointer;
        }
        .flevo-btn-check-now {
            width: 100%;
            background: transparent;
            border: 1px dashed #94a3b8;
            color: #64748b;
            padding: 10px;
            border-radius: 8px;
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        .flevo-btn-check-now:hover {
            border-color: #24CA68;
            color: #24CA68;
            background: #f0fdf4;
        }
        .flevo-state {
            text-align: center;
        }
        .flevo-spinner {
            width: 50px;
            height: 50px;
            border: 4px solid #e2e8f0;
            border-top-color: #24CA68;
            border-radius: 50%;
            animation: flevoSpin 0.8s linear infinite;
            margin: 20px auto;
        }
        @keyframes flevoSpin {
            to { transform: rotate(360deg); }
        }
        .flevo-title {
            font-size: 1.25rem;
            font-weight: 700;
            color: #1e293b;
            margin: 10px 0;
        }
        .flevo-desc {
            font-size: 0.9rem;
            color: #64748b;
            line-height: 1.5;
            margin-bottom: 20px;
        }
        .flevo-success-icon {
            margin: 15px auto;
            animation: flevoBounce 0.6s ease;
        }
        @keyframes flevoBounce {
            0% { transform: scale(0.3); opacity: 0; }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); opacity: 1; }
        }
        .flevo-success-title {
            color: #166534;
            font-size: 1.5rem;
            font-weight: 800;
            margin-bottom: 10px;
        }
        .flevo-success-desc {
            font-size: 0.95rem;
            color: #334155;
            line-height: 1.5;
            margin-bottom: 20px;
        }
        .flevo-success-badge {
            display: inline-block;
            background: #22c55e;
            color: #ffffff;
            font-weight: 700;
            padding: 8px 16px;
            border-radius: 9999px;
            margin-bottom: 20px;
        }
        .flevo-btn-close-final, .flevo-btn-retry {
            width: 100%;
            padding: 12px;
            background: #24CA68;
            color: #fff;
            border: none;
            border-radius: 10px;
            font-weight: 700;
            font-size: 1rem;
            cursor: pointer;
        }
        .flevo-error-icon {
            font-size: 3rem;
            margin: 10px 0;
        }
        `;

        const styleEl = document.createElement('style');
        styleEl.id = 'flevoPixModalStyles';
        styleEl.textContent = css;
        document.head.appendChild(styleEl);
    }

    // Alterna visualização de estados no modal
    function setModalState(state) {
        const loading = document.getElementById('flevoStateLoading');
        const ready = document.getElementById('flevoStateReady');
        const success = document.getElementById('flevoStateSuccess');
        const error = document.getElementById('flevoStateError');

        if (loading) loading.style.display = (state === 'loading') ? 'block' : 'none';
        if (ready) ready.style.display = (state === 'ready') ? 'block' : 'none';
        if (success) success.style.display = (state === 'success') ? 'block' : 'none';
        if (error) error.style.display = (state === 'error') ? 'block' : 'none';
    }

    // Renderiza o QR Code (usando QRCode.js ou fallback seguro)
    function renderQrCode(qrString) {
        const container = document.getElementById('flevoQrCodeContainer');
        if (!container) return;
        container.innerHTML = '';

        if (typeof QRCode !== 'undefined') {
            try {
                new QRCode(container, {
                    text: qrString,
                    width: 200,
                    height: 200,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.M
                });
                return;
            } catch (e) {
                console.warn('[FlevoPay] Falha ao renderizar QRCode local:', e);
            }
        }

        // Fallback caso a biblioteca ainda esteja carregando
        const img = document.createElement('img');
        img.alt = 'QR Code Pix';
        img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(qrString);
        container.appendChild(img);
    }

    // Inicia contagem regressiva de expiração (15 minutos)
    function startCountdown() {
        if (countdownInterval) clearInterval(countdownInterval);
        let secondsLeft = 15 * 60;
        const timerText = document.getElementById('flevoTimerText');

        function update() {
            const m = Math.floor(secondsLeft / 60);
            const s = secondsLeft % 60;
            if (timerText) {
                timerText.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }
            if (secondsLeft <= 0) {
                clearInterval(countdownInterval);
            }
            secondsLeft--;
        }

        update();
        countdownInterval = setInterval(update, 1000);
    }

    // Inicia verificação automática de status a cada 3 segundos
    function startPolling(transactionId) {
        if (pollInterval) clearInterval(pollInterval);
        if (!transactionId) return;

        pollInterval = setInterval(async () => {
            const status = await queryTransactionStatus(transactionId);
            if (status === 'approved' || status === 'paid' || status === 'completed') {
                clearInterval(pollInterval);
                onPaymentSuccess();
            }
        }, 3000);
    }

    // Consulta status via proxy ou direto
    async function queryTransactionStatus(transactionId) {
        const endpoints = [
            `/api/flevopay/status?id=${encodeURIComponent(transactionId)}`,
            `flevopay.php?action=status&id=${encodeURIComponent(transactionId)}`,
            `https://app.flevopay.com.br/api/v1/query?action=get_transaction&id=${encodeURIComponent(transactionId)}`
        ];

        for (const ep of endpoints) {
            try {
                const headers = {};
                if (ep.includes('app.flevopay.com.br')) {
                    headers['X-API-Key'] = FLEVO_SECRET_KEY;
                }
                const res = await fetch(ep, { headers });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.status) {
                        return data.status.toLowerCase();
                    }
                }
            } catch (e) {
                // Tenta próximo endpoint silenciosamente
            }
        }
        return 'pending';
    }

    // Dispara criação da transação
    async function requestCreatePix(amountCents, customCustomer) {
        const endpoints = [
            '/api/flevopay/create',
            'flevopay.php?action=create',
            'https://app.flevopay.com.br/api/v1/transaction'
        ];

        const payload = {
            amount: amountCents,
            description: "Doação Amor Vivo - Kerllen",
            reference: "REF_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36),
            source: "api_externa",
            customer: customCustomer || {
                name: "Doador Solidário",
                email: "doador@amorvivo.online",
                phone: "11999998888",
                document: "12345678901"
            }
        };

        let lastError = null;

        for (const ep of endpoints) {
            try {
                const headers = {
                    'Content-Type': 'application/json'
                };
                if (ep.includes('app.flevopay.com.br')) {
                    headers['X-API-Key'] = FLEVO_SECRET_KEY;
                }

                const res = await fetch(ep, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data && (data.qr_code || data.status === 'success')) {
                        return data;
                    }
                } else {
                    const errJson = await res.json().catch(() => null);
                    if (errJson && errJson.message) {
                        lastError = errJson.message;
                    }
                }
            } catch (err) {
                lastError = err.message;
            }
        }

        throw new Error(lastError || 'Não foi possível comunicar com o gateway.');
    }

    // Trata sucesso do pagamento
    function onPaymentSuccess() {
        setModalState('success');
        const successAmt = document.getElementById('flevoSuccessAmount');
        if (successAmt) successAmt.textContent = formatCentsToBRL(currentAmountInCents);

        // Atualiza a barra de progresso da página em tempo real!
        try {
            const addedVal = currentAmountInCents / 100;
            if (typeof currentRaised !== 'undefined') {
                currentRaised += addedVal;
            }
            if (typeof updateProgress === 'function') {
                updateProgress();
            }
            if (typeof showToast === 'function') {
                showToast(`Obrigado pela doação de ${formatCentsToBRL(currentAmountInCents)}!`);
            }
            if (typeof addDonationCard === 'function') {
                addDonationCard('Você', addedVal);
            }
        } catch (e) {
            console.log('[FlevoPay] Atualização de progresso:', e);
        }
    }

    // API Pública
    window.FlevoPay = {
        // Abre o modal e gera o PIX para um valor em centavos
        generatePix: async function (cents, donorInfo) {
            injectPixModal();
            currentAmountInCents = cents || 3000;

            const modal = document.getElementById('flevoPixModal');
            if (modal) modal.style.display = 'flex';

            // Fecha outros modais antigos
            const oldModals = ['donateModal', 'otherValueModal', 'customValueModal'];
            oldModals.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });

            // Atualiza exibição de valor
            const displayAmt = document.getElementById('flevoDisplayAmount');
            if (displayAmt) displayAmt.textContent = formatCentsToBRL(currentAmountInCents);

            setModalState('loading');

            try {
                const tx = await requestCreatePix(currentAmountInCents, donorInfo);
                activeTransaction = tx;

                // Renderiza QR Code
                const qrCodeString = tx.qr_code || "";
                renderQrCode(qrCodeString);

                // Preenche o campo Copia e Cola
                const codeInput = document.getElementById('flevoPixCodeInput');
                if (codeInput) codeInput.value = qrCodeString;

                // Inicia timers
                startCountdown();
                startPolling(tx.transaction_id || tx.id);

                setModalState('ready');
            } catch (err) {
                console.error('[FlevoPay] Erro ao gerar PIX:', err);
                const errEl = document.getElementById('flevoErrorMessage');
                if (errEl) errEl.textContent = err.message || 'Erro ao comunicar com o servidor Flevo Pay.';
                setModalState('error');
            }
        },

        // Copia o código PIX para a área de transferência
        copyPixCode: function () {
            const codeInput = document.getElementById('flevoPixCodeInput');
            const btn = document.getElementById('flevoBtnCopy');
            if (!codeInput || !codeInput.value) return;

            const textToCopy = codeInput.value;

            function showCopied() {
                if (btn) {
                    btn.classList.add('copied');
                    btn.innerHTML = `
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>Código Pix Copiado com Sucesso!</span>
                    `;
                    setTimeout(() => {
                        btn.classList.remove('copied');
                        btn.innerHTML = `
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            <span>Copiar Código Pix</span>
                        `;
                    }, 3000);
                }
            }

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(textToCopy).then(showCopied).catch(() => {
                    codeInput.select();
                    document.execCommand('copy');
                    showCopied();
                });
            } else {
                codeInput.select();
                document.execCommand('copy');
                showCopied();
            }
        },

        // Verifica status manualmente
        checkStatusNow: async function () {
            if (!activeTransaction) return;
            const btn = document.querySelector('.flevo-btn-check-now');
            if (btn) btn.textContent = 'Verificando com o banco...';

            const status = await queryTransactionStatus(activeTransaction.transaction_id || activeTransaction.id);
            if (status === 'approved' || status === 'paid' || status === 'completed') {
                onPaymentSuccess();
            } else {
                if (btn) {
                    btn.textContent = 'Pagamento ainda não identificado. Tente novamente em alguns segundos.';
                    setTimeout(() => {
                        btn.textContent = 'Já realizei o pagamento';
                    }, 3000);
                }
            }
        },

        // Atualiza com dados fornecidos pelo doador
        regenerateWithDonorInfo: function () {
            const name = document.getElementById('flevoDonorName')?.value.trim();
            const cpf = document.getElementById('flevoDonorCpf')?.value.replace(/\D/g, '').trim();

            const customCustomer = {
                name: name || "Doador Solidário",
                email: "doador@amorvivo.online",
                phone: "11999998888",
                document: cpf && cpf.length >= 11 ? cpf : "12345678901"
            };

            window.FlevoPay.generatePix(currentAmountInCents, customCustomer);
        },

        // Tentar novamente em caso de erro
        retryGeneration: function () {
            window.FlevoPay.generatePix(currentAmountInCents);
        },

        // Fecha o modal
        closeModal: function () {
            const modal = document.getElementById('flevoPixModal');
            if (modal) modal.style.display = 'none';
            if (pollInterval) clearInterval(pollInterval);
            if (countdownInterval) clearInterval(countdownInterval);
        }
    };

    // Função de máscara de moeda brasileira (R$)
    function applyBRLMask(input) {
        if (!input) return;
        input.addEventListener('input', function () {
            let val = this.value.replace(/\D/g, '');
            if (!val) {
                this.value = '';
                return;
            }
            let num = (parseInt(val, 10) / 100).toFixed(2).replace('.', ',');
            this.value = 'R$ ' + num.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        });
    }

    // Alterna a exibição da seção de valor personalizado
    window.toggleCustomValueSection = function () {
        const sec = document.getElementById('customValueSection');
        const inp = document.getElementById('customInputBRL');
        if (!sec) return;
        if (sec.style.display === 'none' || !sec.style.display) {
            sec.style.display = 'block';
            if (inp) {
                inp.focus();
                if (!inp.value) inp.value = 'R$ 50,00';
            }
            setTimeout(() => {
                sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 60);
        } else {
            sec.style.display = 'none';
        }
    };

    // Submete o valor digitado manualmente e gera o PIX
    window.submitCustomValuePix = function () {
        const inp = document.getElementById('customInputBRL') || 
                    document.getElementById('moneyInputOther') || 
                    document.getElementById('moneyInput');

        if (!inp || !inp.value.trim()) {
            alert('Por favor, digite o valor que deseja doar.');
            if (inp) inp.focus();
            return;
        }

        let raw = inp.value.replace(/\D/g, '');
        if (!raw) {
            alert('Por favor, digite um valor válido.');
            if (inp) inp.focus();
            return;
        }

        let cents = parseInt(raw, 10);
        if (cents < 100) cents = 100; // mínimo R$ 1,00

        // Fecha os modais de escolha
        ['donateModal', 'customValueModal', 'otherValueModal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // Gera o Pix com o valor exato digitado!
        window.FlevoPay.generatePix(cents);
    };

    // Interceptador global de todos os botões e links de valores
    function setupValueInterceptors() {
        injectPixModal();

        // Aplica máscara nos campos de digitação de valor
        applyBRLMask(document.getElementById('customInputBRL'));
        applyBRLMask(document.getElementById('moneyInput'));
        applyBRLMask(document.getElementById('moneyInputOther'));

        // 1. Interceptar links de valores fixos (R$ 30, R$ 50, etc.)
        const donationLinks = document.querySelectorAll('.donation-link, a[href*="checkout"], a[href*="pay.loveum.shop"]');
        donationLinks.forEach(link => {
            // NUNCA interceptar botões de digitar outro valor!
            const isCustom = link.id === 'btnToggleCustomValue' ||
                             link.classList.contains('btn-outro-valor') ||
                             (link.getAttribute('onclick') && link.getAttribute('onclick').toLowerCase().includes('customvalue')) ||
                             link.textContent.toLowerCase().includes('outro valor') ||
                             link.textContent.toLowerCase().includes('digitar');

            if (isCustom) {
                return;
            }

            link.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                const text = this.textContent.trim();
                const cents = parseTextToCents(text);
                window.FlevoPay.generatePix(cents);
            }, true);
        });

        // 2. Botões de atalho de valor rápido (.btn-quick-val, data-v, data-value)
        document.querySelectorAll('.btn-quick-val, button[data-v], button[data-value]').forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const val = this.getAttribute('data-val') || this.getAttribute('data-v') || this.getAttribute('data-value');
                const inps = [
                    document.getElementById('customInputBRL'),
                    document.getElementById('moneyInputOther'),
                    document.getElementById('moneyInput')
                ];
                inps.forEach(inp => {
                    if (inp && val) {
                        let num = (parseInt(val, 10)).toFixed(2).replace('.', ',');
                        inp.value = 'R$ ' + num;
                    }
                });
            });
        });

        // 3. Botões "DOAR AGORA" / "CONTRIBUIR AGORA!" (#submitValueBtn, #btnDoarAgoraCustom)
        const submitBtns = document.querySelectorAll('#btnDoarAgoraCustom, #submitValueBtn, button[onclick*="submitValue"], button[onclick*="submitCustomValuePix"]');
        submitBtns.forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                window.submitCustomValuePix();
            }, true);
        });

        window.submitValue = window.submitCustomValuePix;
    }

    // Inicializa quando o documento estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupValueInterceptors);
    } else {
        setupValueInterceptors();
    }
})();
