const { fork } = require('child_process');
const { join } = require('path');
const fs = require('fs-extra');
const logger = require('./utils/console');
const http = require('http');

// ==========================================
// سيرفر وهمي لمنع Hugging Face من إغلاق البوت
// ==========================================
http.createServer((req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end('WhatsApp bot is running. Scan the QR shown in the private Replit workflow console; QR pairing does not require entering a phone number.');
}).listen(7860, () => {
    console.log('🌐 Web server is running on port 7860 (Hugging Face Port)');
});

// ==========================================
// إعدادات التشغيل
// ==========================================
const maxRetries = 5;
const retryDelay = 3000;
let isRunning = false;

function startForexBot() {
    const currentPath = process.cwd();
    const connectionFolder = join(currentPath, 'auth_info_qr');

    if (!fs.existsSync(connectionFolder)) {
        logger.warn('🍁 ملف الاتصال مفقود، جاري إنشاء بيئة التشغيل...');
    }

    if (isRunning) return;
    isRunning = true;

    logger.info('Starting 𝑭𝑶𝑹𝑬𝑿 𝑩𝑶𝑻 🍂...');

    // تشغيل العملية الأساسية (Main Process) المتواجدة في ملف main.js
    const child = fork(join(__dirname, 'main.js'), [], {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env: { ...process.env, CONNECTION_FOLDER: connectionFolder }
    });

    child.on('message', (data) => {
        if (data === 'ready') {
            logger.success('❖ 𝑭𝑶𝑹𝑬𝑿 𝑩𝑶𝑻 جـاهـز لـلـعـمـل الآن 🍂🕹️');
        } else if (data === 'reset') {
            logger.warn('🔄 طلب إعادة تشغيل فوري للنظام...');
            child.kill();
        }
    });

    child.on('exit', async (code) => {
        isRunning = false;
        
        // 🎯 كسر الفخ: حتى لو كان الكود 0 (ريستارت آمن)، يعيد التشغيل تلقائياً!
        if (code === 0) {
            logger.info('🍂 تم إغلاق العملية بنجاح، جاري إعادة الإقلاع التلقائي للسيستم...');
            setTimeout(startForexBot, retryDelay);
            return;
        }

        // التعامل مع أخطاء الضغط والـ Rate Limit من سيرفرات الواتساب
        if (code === 429) {
            logger.error('⚠️ حظر مؤقت من واتساب بسبب الضغط، جاري الانتظار دقيقة كاملة...');
            await new Promise(r => setTimeout(r, 60000));
        }

        logger.warn(`⚠️ توقف البوت (Code: ${code}). جاري إعادة المحاولة التلقائية...`);
        setTimeout(startForexBot, retryDelay);
    });

    child.on('error', (err) => {
        isRunning = false;
        logger.error(`❌ خطأ في النظام الداخلي: ${err.message}`);
    });
}

// معالجة أخطاء الـ Process الكبرى لضمان استقرار البوت 100% وعدم توقفه
process.on('uncaughtException', (err) => {
    if (err.code === 'ECONNRESET') return;
    logger.error('❌ خطأ غير متوقع في العمليات:', err);
});

process.on('unhandledRejection', (reason) => {
    logger.error('❌ رفض غير معالج في الوعود:', reason);
});

// انطلاق الهوية الجديدة في الترمكس!
logger.info('𝑷𝑹𝑰𝑴𝑬🍂𝑩𝑶𝑻 - 𝑴𝑶𝑯𝑨𝑴𝑴𝑰');
startForexBot();
