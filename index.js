// ustatop-bot/index.js
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ADMIN_ID = process.env.ADMIN_ID || 7695822564; // .env dan olinadi
const WEBSITE_URL = 'https://ustatop-uz-2026.surge.sh'; // Sayt manzili

const userStates = {};

// ==========================================
// YORDAMCHI FUNKSIYALAR
// ==========================================
async function getUser(telegramId) {
  const { data } = await supabase.from('users').select('*').eq('telegram_id', telegramId).maybeSingle();
  return data;
}

const getRoleName = (role) => {
  const roles = { 'customer': 'Mijoz', 'worker': 'Usta', 'seller': 'Do\'kon', 'admin': 'Admin' };
  return roles[role] || role;
};

// ✅ YANGI: Zamonaviy Inline Menyu (Pastdagi tugmalar o'rniga xabar ichida chiqadi)
const getInlineMenu = (role) => {
  const menu = [
    [
      { text: '👤 Profilim', callback_data: 'menu_profile' },
      { text: '💎 Premium', callback_data: 'menu_premium' }
    ],
    [
      { text: '🔄 Rolni o\'zgartirish', callback_data: 'menu_change_role' },
      { text: '🔑 Mening Parolim', callback_data: 'menu_pin' }
    ],
    [
      { text: '📞 Yordam', callback_data: 'menu_support' }
    ]
  ];
  
  if (role === 'worker' || role === 'seller') {
    menu.push([{ text: '🛡️ Pasport yuklash (KYC)', callback_data: 'menu_kyc' }]);
  }
  
  if (role === 'admin') {
    menu.push([{ text: '🛠 Admin Panel', callback_data: 'menu_admin' }]);
  }

  // ✅ ENG MUHIM TUGMA: Mini App (Saytni ochish)
  menu.push([{ text: '🚀 Saytga kirish (Mini App)', web_app: { url: WEBSITE_URL } }]);

  return Markup.inlineKeyboard(menu);
};

// ✅ XAVFSIZLIK: BAN TEKSHIRUVI (Har qanday xabardan oldin ishlaydi)
bot.use(async (ctx, next) => {
  if (ctx.from && ctx.from.id) {
    const user = await getUser(ctx.from.id);
    if (user && user.is_banned) {
      return ctx.reply('🚫 Sizning akkauntingiz qoidabuzarlik uchun bloklangan. Yordam uchun @ustatoping ga yozing.');
    }
  }
  return next();
});

// ==========================================
// 1. /start (Saytdan kelgan kod bilan)
// ==========================================
bot.start(async (ctx) => {
  const payload = ctx.startPayload;

  if (payload) {
    try {
      const { data: req, error } = await supabase.from('auth_requests').select('*').eq('code', payload).maybeSingle();
      if (error || !req) return ctx.reply("❌ Kod topilmadi yoki eskirgan.");

      const token = crypto.randomBytes(16).toString('hex');
      const last9 = req.phone.replace(/\D/g, '').slice(-9);
      let { data: user } = await supabase.from('users').select('*').ilike('phone', `%${last9}%`).maybeSingle();

      if (!user) {
        const { data: newUser, error: cErr } = await supabase.from('users').insert([{
          telegram_id: ctx.from.id, name: ctx.from.first_name, phone: req.phone, role: 'customer', auth_token: token
        }]).select().single();
        if (cErr) return ctx.reply("❌ User yaratishda xato.");
        user = newUser;
      } else {
        await supabase.from('users').update({ auth_token: token, telegram_id: ctx.from.id }).eq('id', user.id);
      }

      await supabase.from('auth_requests').update({ status: 'approved', auth_token: token }).eq('id', req.id);

      return ctx.reply(
        `✅ <b>Muvaffaqiyatli tasdiqlandi!</b>\n\nSaytga o'tish uchun pastdagi <b>"🚀 Saytga kirish"</b> tugmasini bosing.`,
        { parse_mode: 'HTML', ...getInlineMenu(user.role) }
      );
    } catch (err) {
      return ctx.reply("⚠️ Server xatosi. Keyinroq urinib ko'ring.");
    }
  }

  const user = await getUser(ctx.from.id);
  if (user && user.phone) {
    return ctx.reply(`Assalomu alaykum, <b>${user.name}</b>! 👋\nRolingiz: ${getRoleName(user.role)}`, { parse_mode: 'HTML', ...getInlineMenu(user.role) });
  }
  
  ctx.reply(`Assalomu alaykum! Tizimga kirish uchun telefon raqamingizni yuboring:`, 
    Markup.keyboard([[Markup.button.contactRequest('📱 Telefon raqamni yuborish')]]).resize());
});

// ==========================================
// 2. Telefon raqam
// ==========================================
bot.on('contact', async (ctx) => {
  const phone = ctx.message.contact.phone_number;
  const telegramId = ctx.from.id;
  const name = ctx.from.first_name;

  let user = await getUser(telegramId);
  if (!user) {
    const initialPin = Math.floor(100000 + Math.random() * 900000).toString();
    const initialToken = crypto.randomBytes(16).toString('hex');
    
    await supabase.from('users').insert([{ telegram_id: telegramId, name, phone, role: 'customer', auth_pin: initialPin, auth_token: initialToken }]);
    
    ctx.reply(`Rahmat! Tizimga qo'shildingiz. 🙋‍♂️\n\n🔐 <b>Parolingiz:</b> <code>${initialPin}</code>`, { parse_mode: 'HTML' });
    ctx.reply(`Yo'nalishni tanlang:`, Markup.inlineKeyboard([
      [{ text: '🙋 Mijoz', callback_data: 'select_role_customer' }],
      [{ text: '👷 Usta', callback_data: 'select_role_worker' }],
      [{ text: '🏪 Do\'kon', callback_data: 'select_role_seller' }]
    ]));
  } else {
    await supabase.from('users').update({ phone }).eq('telegram_id', telegramId);
    ctx.reply(`Telefon yangilandi.`, getInlineMenu(user.role));
  }
});

// ==========================================
// 3. INLINE MENYU ISHLOVLARI (Callbacks)
// ==========================================
bot.action('menu_profile', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) return ctx.answerCbQuery('Xatolik');
  let statusText = user.role === 'customer' ? '✅ Mijoz' : (user.verification_status === 'approved' ? '✅ Tasdiqlangan' : '⏳ Kutilmoqda');
  ctx.reply(`<b>👤 Profilingiz:</b>\n\nIsm: ${user.name}\nRol: <b>${getRoleName(user.role)}</b>\nHolat: ${statusText}\nBalans: ${(user.wallet_balance || 0).toLocaleString()} so'm\nPremium: ${user.premium_until && new Date(user.premium_until) > new Date() ? user.premium_tier.toUpperCase() : "Yo'q"}`, { parse_mode: 'HTML' });
  ctx.answerCbQuery();
});

bot.action('menu_pin', async (ctx) => {
  const user = await getUser(ctx.from.id);
  ctx.reply(`🔐 <b>Sizning doimiy kirish parolingiz:</b> <code>${user.auth_pin}</code>\n\n<i>Uni hech kimga bermang!</i>`, { parse_mode: 'HTML' });
  ctx.answerCbQuery();
});

bot.action('menu_support', async (ctx) => {
  ctx.reply(`📞 +998 88 982 22 27\n✈️ @ustatoping`, { parse_mode: 'HTML' });
  ctx.answerCbQuery();
});

bot.action('menu_kyc', async (ctx) => {
  ctx.reply(`KYC (Pasport yuklash) uchun pastdagi tugmani bosing:`, Markup.keyboard([['🛡️ Pasport yuklash (KYC)']]).resize());
  ctx.answerCbQuery();
});

bot.action('menu_admin', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('Ruxsat yo\'q', { show_alert: true });
  ctx.reply(`Admin panelga o'tish uchun saytga kiring.`);
  ctx.answerCbQuery();
});

// ==========================================
// 4. ROLNI TANLASH VA TASDIQLASH
// ==========================================
bot.action(/select_role_(.+)/, async (ctx) => {
  const role = ctx.match[1];
  let warningText = role === 'worker' ? "Usta bo'lish uchun Pasport va Selfie yuklab, KYC tasdiqlatish shart." : (role === 'seller' ? "Do'kon ochish uchun hujjatlar yuklab, KYC tasdiqlatish shart." : "Mijoz sifatida darhol kirib, xarid qilishingiz mumkin.");
  
  ctx.editMessageText(`Siz <b>${getRoleName(role)}</b> rolini tanlamoqchisiz.\n\n${warningText}\n\n<b>Davom etamizmi?</b>`, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '✅ Ha', callback_data: `confirm_role_${role}` }], [{ text: '❌ Bekor qilish', callback_data: 'cancel_role' }]] }
  });
});

bot.action(/confirm_role_(.+)/, async (ctx) => {
  const newRole = ctx.match[1];
  const telegramId = ctx.from.id;
  const currentUser = await getUser(telegramId);

  if (currentUser.role === newRole) return ctx.answerCbQuery('Siz allaqachon bu roldasiz.', { show_alert: true });

  if (newRole === 'customer') {
    await supabase.from('users').update({ role: 'customer', verification_status: 'approved' }).eq('telegram_id', telegramId);
    return ctx.editMessageText(`✅ Siz endi Mijoz rolidasiz.`, { parse_mode: 'HTML' })
      .then(() => ctx.reply(`Asosiy menyu:`, getInlineMenu('customer')));
  }

  if (newRole === 'worker' || newRole === 'seller') {
    await supabase.from('users').update({ role: newRole, verification_status: 'pending', is_verified: false }).eq('telegram_id', telegramId);
    return ctx.editMessageText(`🛡️ <b>KYC!</b>\n\nPastdagi menyudan "Pasport yuklash" tugmasini bosing va hujjatlaringizni yuboring.`, { parse_mode: 'HTML' })
      .then(() => ctx.reply(`Asosiy menyu:`, getInlineMenu(newRole)));
  }
});

bot.action('cancel_role', (ctx) => ctx.editMessageText(`❌ Bekor qilindi.`));

// ==========================================
// 5. KYC JARAYONI (Pasport yuklash)
// ==========================================
bot.hears('🛡️ Pasport yuklash (KYC)', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user || (user.role !== 'worker' && user.role !== 'seller')) return ctx.reply('Faqat Ustalar va Do\'konlar uchun.');
  if (user.verification_status === 'approved') return ctx.reply('✅ Hujjatlaringiz allaqachon tasdiqlangan.');

  userStates[ctx.from.id] = 'waiting_for_id';
  ctx.reply(`Iltimos, <b>Pasport yoki ID karta</b> rasmini yuboring.\n\nBekor qilish uchun /cancel deb yozing.`, { parse_mode: 'HTML' });
});

bot.command('cancel', (ctx) => {
  delete userStates[ctx.from.id];
  ctx.reply('Bekor qilindi.');
});

bot.on('photo', async (ctx) => {
  const state = userStates[ctx.from.id];
  if (!state) return;

  const user = await getUser(ctx.from.id);
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  
  try {
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    const response = await fetch(fileLink.href);
    const buffer = Buffer.from(await response.arrayBuffer());
    const fileName = `${user.id}_${state}_${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage.from('verifications').upload(fileName, buffer, { contentType: 'image/jpeg' });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from('verifications').getPublicUrl(fileName);
    const publicUrl = publicUrlData.publicUrl;

    if (state === 'waiting_for_id') {
      await supabase.from('users').update({ id_card_url: publicUrl }).eq('id', user.id);
      userStates[ctx.from.id] = 'waiting_for_selfie';
      ctx.reply(`✅ Pasport qabul qilindi.\n\nEndi <b>Selfie</b> (o'zingizni rasmga oling) yuboring.`, { parse_mode: 'HTML' });
    } 
    else if (state === 'waiting_for_selfie') {
      await supabase.from('users').update({ selfie_url: publicUrl }).eq('id', user.id);
      if (user.role === 'seller') {
        userStates[ctx.from.id] = 'waiting_for_license';
        ctx.reply(`✅ Selfie qabul qilindi.\n\nEndi <b>Do'kon Guvohnomasi (Litsenziya)</b> rasmini yuboring.`, { parse_mode: 'HTML' });
      } else {
        delete userStates[ctx.from.id];
        await supabase.from('users').update({ verification_status: 'pending' }).eq('id', user.id);
        ctx.reply(`✅ Barcha hujjatlar qabul qilindi! Admin tekshiruviga yuborildi.`);
      }
    }
    else if (state === 'waiting_for_license') {
      await supabase.from('users').update({ shop_license_url: publicUrl, verification_status: 'pending' }).eq('id', user.id);
      delete userStates[ctx.from.id];
      ctx.reply(`✅ Barcha hujjatlar qabul qilindi! Admin tekshiruviga yuborildi.`);
    }
  } catch (err) {
    ctx.reply('❌ Xatolik yuz berdi. Qayta yuboring.');
  }
});

// ==========================================
// REALTIME LISTENER (Bildirishnomalar)
// ==========================================
supabase.channel('custom-all-channel')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, async (payload) => {
    const notif = payload.new;
    const { data: user } = await supabase.from('users').select('telegram_id').eq('id', notif.user_id).single();
    if (user && user.telegram_id) {
      try {
        let icon = notif.type === 'order' ? '📋' : notif.type === 'message' ? '💬' : '🔔';
        await bot.telegram.sendMessage(user.telegram_id, `${icon} <b>${notif.title}</b>\n\n${notif.message}`, { parse_mode: 'HTML' });
      } catch (err) {}
    }
  }).subscribe();

// ==========================================
// ISHGA TUSHIRISH
// ==========================================
bot.launch().then(() => console.log('🤖 Bot xavfsiz va professional rejimda ishga tushdi!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
