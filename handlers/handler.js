const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { loadProjectModule } = require('../utils/load-module');

const commands = new Map();
const aliasesMap = new Map();

const commandsPath = path.join(__dirname, '../commands');

global.recentActiveUsers = global.recentActiveUsers || {};
global.gamingSessions = global.gamingSessions || new Map();

const rootDir = path.join(__dirname, '..');
const whitelistPath = path.join(rootDir, 'whitelist.json');
const modePath = path.join(rootDir, 'data', 'mode.txt');
const configPath = path.join(rootDir, 'config.js');
const dbPath = path.join(__dirname, '../commands/مجلد العاب/usersData.json'); 

/*
✅ استدعاء محرك RPG
*/
const rpgDbPath = path.join(__dirname, '../commands/مجلد العاب/rpgDatabase.js');
let getActiveSession, addBond;

try {
    if (fs.existsSync(rpgDbPath)) {
        const rpgDb = require(rpgDbPath);
        getActiveSession = rpgDb.getActiveSession;
        addBond = rpgDb.addBond;
    }
} catch (e) {
    console.log(chalk.red('⚠️ خطأ بتحميل rpgDatabase.js'));
}

/*
✅ Loader
*/
async function handleMessagesLoader() {
    try {
        if (!fs.existsSync(commandsPath)) {
            fs.mkdirSync(commandsPath, { recursive: true });
        }

        await loadAllCommands();

    } catch (error) {
        console.log(chalk.red('❌ Loader Error:'), error);
    }
}

/*
✅ تحميل الأوامر
*/
async function loadAllCommands() {
    try {
        commands.clear();
        aliasesMap.clear();

        async function scanDirectory(currentPath) {
            if (!fs.existsSync(currentPath)) return;

            const entries = fs.readdirSync(currentPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);

                if (entry.isDirectory() && entry.name !== 'data') {
                    await scanDirectory(fullPath);
                } else if (entry.name.endsWith('.js')) {
                    try {
                        const fileContent = await loadProjectModule(fullPath);
                        const command = fileContent.default ? fileContent.default : fileContent;

                        const cmdName = command.name || command.command;
                        if (!cmdName) continue;

                        const normalizedPath = fullPath.replace(/\\/g, '/');
                        const pathParts = normalizedPath.split('/');
                        const parentDirName = pathParts[pathParts.length - 2];

                        if (parentDirName && (parentDirName.trim() === 'مجلد العاب' || parentDirName.trim() === 'commands')) {
                            command.category = 'العاب';
                        } else if (parentDirName) {
                            command.category = parentDirName.trim();
                        } else {
                            command.category = 'رئيسي';
                        }

                        const commandKey = cmdName.trim().toLowerCase();
                        commands.set(commandKey, command);

                        if (command.aliases && Array.isArray(command.aliases)) {
                            for (const alias of command.aliases) {
                                aliasesMap.set(alias.trim().toLowerCase(), commandKey);
                            }
                        }

                    } catch (err) {
                        console.error(`❌ تعذر تحميل الأمر ${path.relative(rootDir, fullPath)}:`, err.message);
                    }
                }
            }
        }

        await scanDirectory(commandsPath);

        console.log(chalk.green('✅ Handler Loaded Successfully 🚀'));
        console.log(chalk.cyan(`ℹ️ Total Loaded: [ ${commands.size} ] Commands | [ ${aliasesMap.size} ] Aliases.`));

    } catch (e) {
        console.log(chalk.red('❌ Command Load Error:'), e);
    }
}

/*
✅ صلاحيات المطورين الرسمية والمشتركة بدعم كامل للـ LID
*/
function isAllowedUser(jid) {
    try {
        if (!jid) return false;

        const developers = [
            '198067483607129',   
            '212625880224'       
        ];

        const rawJid = String(jid).toLowerCase().trim();
        const cleanNum = rawJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        
        if (developers.includes(cleanNum)) {
            return true;
        }

        if (!fs.existsSync(whitelistPath)) return false;
        const whitelist = JSON.parse(fs.readFileSync(whitelistPath, 'utf8'));
        return whitelist.some(item => {
            const cleanWhite = String(item).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            return cleanWhite === cleanNum;
        });
    } catch (err) {
        return false;
    }
}

/*
✅ Handler الرئيسي
*/
async function handleMessages(sock, msg) {
    try {
        if (!msg?.message) return;

        const botJid = sock.user?.id ? sock.user.id.split(':')[0] + (sock.user.id.includes('@lid') ? '@lid' : '@s.whatsapp.net') : null;
        let senderJid = msg.key.participant || msg.key.remoteJid;

        if (senderJid && senderJid.includes(':')) {
            const suffix = senderJid.includes('@lid') ? '@lid' : '@s.whatsapp.net';
            senderJid = senderJid.split(':')[0] + suffix;
        }

        if (msg.key.fromMe && msg.key.remoteJid !== botJid) {
            if (!sock.isSubBot) return;
        }

        if (senderJid === botJid) return;

        const groupJid = msg.key.remoteJid;
        const authorJid = senderJid;
        const m = msg.message;

        let messageContent = '';
        const messageType = Object.keys(m).find(type => type !== 'messageContextInfo');
        if (!messageType) return;

        if (messageType === 'conversation') {
            messageContent = m.conversation;
        } else if (messageType === 'extendedTextMessage') {
            messageContent = m.extendedTextMessage.text;
        } else if (m[messageType]?.caption) {
            messageContent = m[messageType].caption;
        }

        messageContent = messageContent?.trim() || '';
        if (!messageContent) return;

        if (groupJid && groupJid.endsWith('@g.us')) {
            try {
                let dbMsgData = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf-8')) : {};
                if (!dbMsgData[authorJid]) {
                    dbMsgData[authorJid] = { wins: 0, level: 1, xp: 0, rolls: 0, msgDaily: 0, msgYesterday: 0, msgWeekly: 0, msgMonthly: 0, msgTotal: 0 };
                }
                
                dbMsgData[authorJid].msgDaily = (dbMsgData[authorJid].msgDaily || 0) + 1;
                dbMsgData[authorJid].msgWeekly = (dbMsgData[authorJid].msgWeekly || 0) + 1;
                dbMsgData[authorJid].msgMonthly = (dbMsgData[authorJid].msgMonthly || 0) + 1;
                dbMsgData[authorJid].msgTotal = (dbMsgData[authorJid].msgTotal || 0) + 1;
                
                fs.writeFileSync(dbPath, JSON.stringify(dbMsgData, null, 2), 'utf-8');
            } catch (err) {}
        }

        if (global.xoGames?.has(groupJid)) {
            if (typeof global.handleXOGameText === 'function') {
                const intercepted = await global.handleXOGameText(sock, msg, messageContent, groupJid, authorJid);
                if (intercepted) return; 
            }
        }

        if (global.gamingSessions?.has(groupJid)) {
            if (typeof global.handleDisassembleGameText === 'function') {
                const intercepted = await global.handleDisassembleGameText(sock, msg, messageContent, groupJid, authorJid);
                if (intercepted) return; 
            }
            
            if (typeof global.handleAssembleGameText === 'function') {
                const intercepted = await global.handleAssembleGameText(sock, msg, messageContent, groupJid, authorJid);
                if (intercepted) return; 
            }

            if (typeof global.handleImageGameText === 'function') {
                const intercepted = await global.handleImageGameText(sock, msg, messageContent, groupJid, authorJid);
                if (intercepted) return;
            }

            if (typeof global.handlePrisonGameText === 'function') {
                const intercepted = await global.handlePrisonGameText(sock, msg, messageContent, groupJid, authorJid);
                if (intercepted) return;
            }

            if (typeof global.handleAnimeGameText === 'function') {
                const intercepted = await global.handleAnimeGameText(sock, msg, messageContent, groupJid, authorJid);
                if (intercepted) return;
            }
        }

        const bodyTextLower = messageContent.toLowerCase().trim();

        if (global.activeQuizzes && global.activeQuizzes[groupJid]) {
            const currentQuiz = global.activeQuizzes[groupJid];
            if (currentQuiz.answers.includes(bodyTextLower)) {
                clearTimeout(currentQuiz.timeOut);
                delete global.activeQuizzes[groupJid];

                let data = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf-8')) : {};
                if (!data[authorJid]) data[authorJid] = { wins: 0, level: 1, xp: 0, rolls: 0 };
                if (data[authorJid].xp === undefined) data[authorJid].xp = 0;

                data[authorJid].xp += 50; 
                fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');

                const winText = `🎉 *إجابة صحيحة وممتازة!* \n\n👤 الفائز: @${authorJid.split('@')[0]}\n✅ الإجابة: *${messageContent}*\n💰 الجائزة: +50 نقطة XP تمت إضافتها لمحفظتك الموحدة!`;
                return await sock.sendMessage(groupJid, { text: winText, mentions: [authorJid] }, { quoted: msg });
            }
        }

        if (global.activeEyes && global.activeEyes[groupJid]) {
            const currentEye = global.activeEyes[groupJid];
            if (currentEye.answers.includes(bodyTextLower)) {
                clearTimeout(currentEye.timeOut);
                delete global.activeEyes[groupJid];

                let data = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf-8')) : {};
                if (!data[authorJid]) data[authorJid] = { wins: 0, level: 1, xp: 0, rolls: 0 };
                if (data[authorJid].xp === undefined) data[authorJid].xp = 0;

                data[authorJid].xp += 70; 
                fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');

                const winText = `👁️ *كفوو! عرفت صاحب الصورة بنجاح!* \n\n👤 الفائز: @${authorJid.split('@')[0]}\n✅ البطل هو: *${messageContent}*\n💰 الجائزة: +70 نقطة XP تمت إضافتها لمحفظتك الموحدة!`;
                return await sock.sendMessage(groupJid, { text: winText, mentions: [authorJid] }, { quoted: msg });
            }
        }

        let prefix = '.';
        try {
            const config = require(configPath);
            prefix = config.prefix || '.';
        } catch {
            prefix = '.';
        }

        if (!messageContent.startsWith(prefix)) return;

        const fullInput = messageContent.slice(prefix.length).trim();
        let inputCommand = '';
        let args = [];
        let foundAlias = false;

        const sortedAliases = [...aliasesMap.keys()].sort((a, b) => b.length - a.length);

        for (const alias of sortedAliases) {
            if (fullInput.toLowerCase() === alias || fullInput.toLowerCase().startsWith(alias + ' ')) {
                inputCommand = alias;
                args = fullInput.slice(alias.length).trim().split(/ +/).filter(v => v);
                foundAlias = true;
                break;
            }
        }

        if (!foundAlias) {
            args = fullInput.split(/ +/).filter(v => v);
            inputCommand = args.shift()?.toLowerCase() || '';
        }

        const targetCommandName = aliasesMap.get(inputCommand) || inputCommand;
        const cmd = commands.get(targetCommandName);

        if (!cmd) {
            console.log(chalk.red(`❌ Command Not Found: ${targetCommandName}`));
            return;
        }

        console.log(chalk.green(`✅ Command Matched: ${targetCommandName}`));

        let currentMode = 'off';
        if (fs.existsSync(modePath)) {
            currentMode = fs.readFileSync(modePath, 'utf8').trim().toLowerCase();
        }

        if (currentMode === 'on' && !isAllowedUser(authorJid) && targetCommandName !== 'mode') {
            const allowedGameCmds = ['test', 'تست', 'تسجيل', 'جاهز', 'تفكيك', 'تجمع', 'تجميع', 'بدا', 'صورة', 'اعلام', 'تلميح', 'استسلم', 'بروفايل', 'هروب', 'قتال', 'اختباء', 'ركض', 'تسلل', 'هجوم', 'جاهز', 'اكس_او', 'سولو', 'نهوض'];
            if (cmd.category !== 'العاب' && !allowedGameCmds.includes(targetCommandName)) {
                return;
            }
        }

        console.log(chalk.cyan(`⚡ تشغيل: ${prefix}${targetCommandName}`));

        let isGroupAdmin = false;
        if (groupJid && groupJid.endsWith('@g.us')) {
            try {
                const groupMetadata = await sock.groupMetadata(groupJid);
                const participants = groupMetadata.participants || [];
                const user = participants.find(p => p.id === authorJid);
                isGroupAdmin = user && (user.admin === 'admin' || user.admin === 'superadmin');
            } catch {
                isGroupAdmin = false;
            }
        }

        const isBotOwner = isAllowedUser(authorJid);

        const context = {
            sock,
            msg,
            message: msg,
            args,
            groupJid,
            from: groupJid,
            authorJid,
            sender: authorJid,
            messageType,
            commands,
            isGroupAdmin,
            isAdmin: isGroupAdmin,
            isBotOwner,
            isCreator: isBotOwner,
            targetCommandName
        };

        if (typeof cmd.run === 'function') {
            await cmd.run(context);
        } else if (typeof cmd.execute === 'function') {
            await cmd.execute(sock, msg, args, groupJid, authorJid, messageType);
        }

    } catch (err) {
        console.log(chalk.red('❌ Handler Error:'), err);
    }
}

module.exports = {
    handleMessagesLoader,
    handleMessages
};
