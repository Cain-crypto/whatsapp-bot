const pino = require('pino');
const path = require('path');
const chalk = require('chalk');
const fs = require('fs');
const QRCode = require('qrcode');
const { loadProjectModule } = require('./utils/load-module');
const { handleMessagesLoader, handleMessages } = require('./handlers/handler');

if (!global.conns) {
    global.conns = [];
}

// 🟢 تعديل المسار هنا بدقة ليطابق اسم المجلد الفعلي (مجلد العاب) بدون شرطة سفلية
const messagesDbPath = path.join(__dirname, 'commands', 'مجلد العاب', 'messagesData.json');

// دالة مساعدة للتأكد من وجود مجلدات الحفظ
function ensureDbExists() {
    const dir = path.dirname(messagesDbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

async function startBot() {
    const {
        default: makeWASocket,
        useMultiFileAuthState,
        fetchLatestBaileysVersion,
        DisconnectReason
    } = await import('@whiskeysockets/baileys');
    const { version } = await fetchLatestBaileysVersion();

    console.log(chalk.blue.bold(`\n==================================================`));
    console.log(chalk.blue.bold(`   🔥 𝑭𝑶𝑹𝑬𝑿 𝑩𝑶𝑻 - 𝘾𝙇𝙀𝘼𝙉 𝙀DdIT𝑰𝙊Nation 🍂`));
    console.log(chalk.blue.bold(`==================================================\n`));

    const sessionPath = process.env.CONNECTION_FOLDER || path.join(__dirname, 'auth_info_qr');
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // إلغاء الـ QR واستبداله برمز الربط بالرقم بناءً على رغبتك
        auth: state,
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        version
    });

    global.sock = sock;
    sock.isSubBot = false;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            try {
                const terminalQr = await QRCode.toString(qr, { type: 'terminal', small: true });
                console.log(chalk.yellow('\nScan this QR in WhatsApp: Linked devices → Link a device\n'));
                console.log(terminalQr);
            } catch (error) {
                console.error(chalk.red('❌ Failed to render the WhatsApp QR code:'), error.message);
            }
        }

        if (connection === 'close') {
            const disconnectError = lastDisconnect?.error;
            const shouldReconnect = disconnectError?.output?.statusCode !== DisconnectReason.loggedOut;
            console.warn(
                chalk.yellow('⚠️ WhatsApp connection closed:'),
                disconnectError?.message || 'No error details',
                `(status ${disconnectError?.output?.statusCode ?? 'unknown'})`
            );
            if (shouldReconnect) {
                setTimeout(() => {
                    startBot().catch((error) => {
                        console.error(chalk.red('❌ WhatsApp reconnect failed:'), error.message);
                    });
                }, 3000);
            }
        } else if (connection === 'open') {
            console.log(chalk.hex('#00FF00')('\n✅ [SUCCESS] CONNECTED: البوت الرئيسي جاهز!'));

            try {
                const hisbahCommandPath = path.join(__dirname, 'commands', 'مجلد العاب', 'الحسبة_النهائية.js');
                if (fs.existsSync(hisbahCommandPath)) {
                    const hisbahModule = await loadProjectModule(hisbahCommandPath);
                    const hisbah = hisbahModule.default || hisbahModule;

                    if (hisbah && typeof hisbah.initAutoScheduler === 'function') {
                        hisbah.initAutoScheduler(sock);
                        console.log(chalk.cyan('⏰ [نظام الحسبة] تم ربط وتفعيل الموقت التلقائي بنجاح (فحص يومي الساعة 22:00)...'));
                    }
                }
            } catch (err) {
                console.log(chalk.red('❌ فشل ربط موعد الحسبة التلقائي:'), err.message);
            }
        }
    });

    try {
        await handleMessagesLoader();
    } catch (e) {
        console.log(chalk.red('❌ خطأ في تشغيل اللودر:'), e.message);
    }

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const msg = chatUpdate.messages[0];
            if (!msg || !msg.message) return;

            const groupJid = msg.key.remoteJid;
            const sender = msg.key.participant || msg.key.remoteJid;
            
            if (groupJid && groupJid.endsWith('@g.us')) {
                const cleanSenderNum = String(sender).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
                const rootDir = process.cwd();
                const strictMutedFile = path.join(rootDir, 'data', 'mutedUsers.json');

                // 🔇 [نظام الكتم والنسف التلقائي للمكتومين]
                if (fs.existsSync(strictMutedFile)) {
                    const mutedData = JSON.parse(fs.readFileSync(strictMutedFile, 'utf-8'));
                    if (mutedData[groupJid] && mutedData[groupJid].length > 0) {
                        const isMuted = mutedData[groupJid].some(mutedJid => {
                            const cleanMutedNum = String(mutedJid).split('@')[0].replace(/[^0-9]/g, '');
                            return cleanMutedNum === cleanSenderNum;
                        });

                        if (isMuted) {
                            console.log(chalk.red(`🗑️ [نظام الكتم] رصد رسالة من شخص مكتوم رقم: (${cleanSenderNum})، جاري النسف...`));
                            await sock.sendMessage(groupJid, {
                                delete: { remoteJid: groupJid, fromMe: false, id: msg.key.id, participant: sender }
                            });
                            return; 
                        }
                    }
                }

                // 📊 [نظام الحفظ التلقائي لرسائل الحسبة - 𝑭𝑶𝑹𝑬𝑿 𝑩𝑶𝑻]
                if (!msg.key.fromMe) {
                    ensureDbExists();
                    let messagesData = [];
                    if (fs.existsSync(messagesDbPath)) {
                        try { messagesData = JSON.parse(fs.readFileSync(messagesDbPath, 'utf-8')); } catch (e) { messagesData = []; }
                    }

                    messagesData.push({
                        groupJid: groupJid,
                        authorJid: sender,
                        pushName: msg.pushName || "صياد مجهول",
                        timestamp: Date.now()
                    });

                    // تنظيف السجل تلقائياً للاحتفاظ بآخر 48 ساعة لحماية المساحة
                    const limitTime = Date.now() - (2 * 24 * 60 * 60 * 1000);
                    messagesData = messagesData.filter(m => m.timestamp > limitTime);

                    fs.writeFileSync(messagesDbPath, JSON.stringify(messagesData, null, 2), 'utf-8');
                }
            }

            // 1️⃣ تشغيل الهاندلر للبوت الرئيسي إذا لم تكن الرسالة من نفسه
            if (!msg.key.fromMe) {
                await handleMessages(sock, msg);
            }

            // 2️⃣ تمرير الرسالة بشكل منفصل لكل البوتات الفرعية المتصلة
            if (global.conns && global.conns.length > 0) {
                for (const subSock of global.conns) {
                    if (subSock && subSock.ev) {
                        try {
                            subSock.isSubBot = true;
                            await handleMessages(subSock, msg);
                        } catch (err) {
                            console.error("❌ خطأ أثناء تمرير الأمر للبوت الفرعي:", err.message);
                        }
                    }
                }
            }

        } catch (error) {
            console.error("❌ خطأ في استقبال ومعالجة الرسالة:", error.message);
        }
    });

}

startBot().catch((error) => {
    console.error(chalk.red('❌ Bot startup failed:'), error);
    process.exitCode = 1;
});
