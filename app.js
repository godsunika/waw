const http                       = require('http');
const axios                      = require('axios');
const qrcode                     = require('qrcode');
const express                    = require('express');
const socketIO                   = require('socket.io');            // send qr to html
const { body, validationResult } = require('express-validator');
const fileUpload                 = require('express-fileupload');
const { phoneNumberFormatter }   = require('./helpers/formatter');

const { Client, Location, List, Buttons, LocalAuth, MessageMedia } = require('whatsapp-web.js');
// const client = new Client({
//     puppeteer: {
//         headless: false,
//         args: [
//             '--no-sandbox',
//             '--disable-setuid-sandbox',
//             '--disable-dev-shm-usage',
//             '--disable-accelerated-2d-canvas',
//             '--no-first-run',
//             '--no-zygote',
//             '--single-process', // <- this one doesn't works in Windows
//             '--disable-gpu'
//         ]
//     },
//     authStrategy: new LocalAuth(),
// });

const app    = express();
const server = http.createServer(app);
const io     = socketIO(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ debug: true }));

app.get('/', (req, res) => {
    res.sendFile('index.html', { root: __dirname });
        
    //     status(200).json({
    //     status : true,
    //     message: 'not just hellow world'
    // })
});

const client = new Client({
    puppeteer: {
        headless: false,
        // executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    },
    // authStrategy: new LocalAuth(),
});

client.on('loading_screen', (percent, message) => {
    console.log('LOADING SCREEN', percent, message);
});

client.on('auth_failure', msg => {
    // Fired if session restore was unsuccessful
    console.error('AUTHENTICATION FAILURE', msg);
});

client.on('disconnected', () => {
    console.log('Disconnected');
})

client.on('message', async msg => {
    console.log('MESSAGE RECEIVED', msg);

    if (msg.body == '!ping') {
        msg.reply('pong');
    } else if(msg.body === 'test') {
		client.sendMessage(msg.from, 'tist');
    } else if (msg.body.startsWith('!sendto ')) {
        // Direct send a new message to specific id
        let number       = msg.body.split(' ')[1];
        let messageIndex = msg.body.indexOf(number) + number.length + 1;
        let message      = msg.body.slice(messageIndex, msg.body.length);
            number       = number.includes('@c.us') ? number : `${number}@c.us`;
        let chat         = await msg.getChat();
        chat.sendSeen();
        client.sendMessage(number, message);

    } else if (msg.body.startsWith('!subject ')) {
        // Change the group subject
        let chat = await msg.getChat();
        if (chat.isGroup) {
            let newSubject = msg.body.slice(9);
            chat.setSubject(newSubject);
        } else {
            msg.reply('This command can only be used in a group!');
        }
    } else if (msg.body.startsWith('!echo ')) {
        // Replies with the same message
        msg.reply(msg.body.slice(6));
    } else if (msg.body.startsWith('!desc ')) {
        // Change the group description
        let chat = await msg.getChat();
        if (chat.isGroup) {
            let newDescription = msg.body.slice(6);
            chat.setDescription(newDescription);
        } else {
            msg.reply('This command can only be used in a group!');
        }
    } else if (msg.body === '!leave') {
        // Leave the group
        let chat = await msg.getChat();
        if (chat.isGroup) {
            chat.leave();
        } else {
            msg.reply('This command can only be used in a group!');
        }
    } else if (msg.body.startsWith('!join ')) {
        const inviteCode = msg.body.split(' ')[1];
        try {
            await client.acceptInvite(inviteCode);
            msg.reply('Joined the group!');
        } catch (e) {
            msg.reply('That invite code seems to be invalid.');
        }
    } else if (msg.body === '!groupinfo') {
        let chat = await msg.getChat();
        if (chat.isGroup) {
            msg.reply(`
                *Group Details*
                Name: ${chat.name}
                Description: ${chat.description}
                Created At: ${chat.createdAt.toString()}
                Created By: ${chat.owner.user}
                Participant count: ${chat.participants.length}
            `);
        } else {
            msg.reply('This command can only be used in a group!');
        }
    } else if (msg.body === '!chats') {
        const chats = await client.getChats();
        client.sendMessage(msg.from, `The bot has ${chats.length} chats open.`);
    } else if (msg.body === '!info') {
        let info = client.info;
        client.sendMessage(msg.from, `
            *Connection info*
            User name: ${info.pushname}
            My number: ${info.wid.user}
            Platform: ${info.platform}
        `);
    } else if (msg.body === '!mediainfo' && msg.hasMedia) {
        const attachmentData = await msg.downloadMedia();
        msg.reply(`
            *Media info*
            MimeType: ${attachmentData.mimetype}
            Filename: ${attachmentData.filename}
            Data (length): ${attachmentData.data.length}
        `);
    } else if (msg.body === '!quoteinfo' && msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();

        quotedMsg.reply(`
            ID: ${quotedMsg.id._serialized}
            Type: ${quotedMsg.type}
            Author: ${quotedMsg.author || quotedMsg.from}
            Timestamp: ${quotedMsg.timestamp}
            Has Media? ${quotedMsg.hasMedia}
        `);
    } else if (msg.body === '!resendmedia' && msg.hasQuotedMsg) {
        const quotedMsg = await msg.getQuotedMessage();
        if (quotedMsg.hasMedia) {
            const attachmentData = await quotedMsg.downloadMedia();
            client.sendMessage(msg.from, attachmentData, { caption: 'Here\'s your requested media.' });
        }
    } else if (msg.body === '!location') {
        const locations = new Location(37.3318, -122.0312, 'Apple Headquarters');
        msg.reply(locations);
        client.sendMessage(msg.from, locations)
    } else if (msg.location) {
        msg.reply(msg.location);
    } else if (msg.body.startsWith('!status ')) {
        const newStatus = msg.body.split(' ')[1];
        await client.setStatus(newStatus);
        msg.reply(`Status was updated to *${newStatus}*`);
    } else if (msg.body === '!mention') {
        const contact = await msg.getContact();
        const chat = await msg.getChat();
        chat.sendMessage(`Hi @${contact.number}!`, {
            mentions: [contact]
        });
    } else if (msg.body === '!delete') {
        if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            if (quotedMsg.fromMe) {
                quotedMsg.delete(true);
            } else {
                msg.reply('I can only delete my own messages');
            }
        }
    } else if (msg.body === '!pin') {
        const chat = await msg.getChat();
        await chat.pin();
    } else if (msg.body === '!archive') {
        const chat = await msg.getChat();
        await chat.archive();
    } else if (msg.body === '!mute') {
        const chat = await msg.getChat();
        // mute the chat for 20 seconds
        const unmuteDate = new Date();
        unmuteDate.setSeconds(unmuteDate.getSeconds() + 20);
        await chat.mute(unmuteDate);
    } else if (msg.body === '!typing') {
        const chat = await msg.getChat();
        // simulates typing in the chat
        chat.sendStateTyping();
    } else if (msg.body === '!recording') {
        const chat = await msg.getChat();
        // simulates recording audio in the chat
        chat.sendStateRecording();
    } else if (msg.body === '!clearstate') {
        const chat = await msg.getChat();
        // stops typing or recording in the chat
        chat.clearState();
    } else if (msg.body === '!jumpto') {
        if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            client.interface.openChatWindowAt(quotedMsg.id._serialized);
        }
    } else if (msg.body === '!buttons') {
        let button = new Buttons('Button body',[{body:'bt1'},{body:'bt2'},{body:'bt3'}],'title','footer');
        client.sendMessage(msg.from, button);
    } else if (msg.body === '!list') {
        let sections = [{title:'sectionTitle',rows:[{title:'ListItem1', description: 'desc'},{title:'ListItem2'}]}];
        let list = new List('List body','btnText',sections,'Title','footer');
        client.sendMessage(msg.from, list);
    } else if (msg.body === '!reaction') {
        msg.react('👍');
    } else if (msg.body === '!sendMedia') {
        const media = MessageMedia.fromFilePath('./1.jpg');
        client.sendMessage(msg.from, media, {caption: 'this is my caption'});
    }
});

client.initialize();

io.on('connection', function(socket) {
    console.log("connected");
    socket.emit('message', 'Connecting... via '+socket.id);

    client.on('qr', (qr) => {
        console.log('QR RECEIVED', qr);
        qrcode.toDataURL(qr, (err, url) => {
            socket.emit('qr', url);
            socket.emit('message', 'QR Code received, scan please');
        })
    });

    client.on('ready', () => {
        console.log('Client is ready!');
        socket.emit('ready', 'Whatsapp is ready!');
        socket.emit('message', 'Whatsapp is ready!');
    });

    client.on('authenticated', () => {
        console.log('AUTHENTICATED');
        socket.emit('authenticated', 'Whatsapp is authenticated!');
        socket.emit('message', 'Whatsapp is authenticated!');
    });
    
})

const checkRegisteredNumber = async (number) => {
    const isRegisted = await client.isRegisteredUser(number);

    return isRegisted;
}

app.post('/send-message', [
    body('number').notEmpty(),
    body('message').notEmpty(),
], async (req, res) => {
    const errors = validationResult(req).formatWith( ({msg}) => {
        return msg;
    });

    if(!errors.isEmpty()) {
        return res.status(422).json({
            status : false,
            message: errors.mapped()
        })
    }
    const number  = phoneNumberFormatter(req.body.number);
    const message = req.body.message;

    const isRegisteredNumber = await checkRegisteredNumber(number);

    if(!isRegisteredNumber) {
        return res.status(422).json({
            status : false,
            message: 'Number is not registered on WhatsApp'
        })
    }

    client.sendMessage(number, message)
    .then(response => {
        res.status(200).json({
            status  : true,
            response: response
        })
    })
    .catch(err => {
        res.status(500).json({
            status  : false,
            response: err
        })
    });
})


app.post('/send-media', [
    body('number').notEmpty(),
    body('message').notEmpty(),
], async (req, res) => {
    const errors = validationResult(req).formatWith( ({msg}) => {
        return msg;
    });

    if(!errors.isEmpty()) {
        return res.status(422).json({
            status : false,
            message: errors.mapped()
        })
    }
    
    const isRegisteredNumber = await checkRegisteredNumber(number);

    if(!isRegisteredNumber) {
        return res.status(422).json({
            status : false,
            message: 'Number is not registered on WhatsApp'
        })
    }

    const number  = phoneNumberFormatter(req.body.number);
    const message = req.body.message;
    
    // // via url
    // const fileUrl = req.body.file;
    // let mimetypeUrl;
    // const attachmentUrl = await axios.get(fileUrl, { responseType: 'arraybuffer'}).then( response => {
    //     mimetypeUrl = response.headers('content-type')
    //     return response.data.toString('base64');
    // });
    // const media = new MessageMedia(mimetypeUrl, attachmentUrl, 'Media')

    // // via upload
    // const mediaFile = req.files.media;
    // const media     = new MessageMedia(mediaFile.mimetype, mediaFile.data.toString('base64'), mediaFile.name)

    // // via local file
    const media   = MessageMedia.fromFilePath('./1.jpg');

    client.sendMessage(number, media, { caption:  message })
    .then(response => {
        res.status(200).json({
            status  : true,
            response: response
        })
    })
    .catch(err => {
        res.status(500).json({
            status  : false,
            response: err
        })
    });
})
server.listen(8000, function() {
    console.log('Application Running on 8000');
})