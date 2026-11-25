// ustatop-bot/index.js
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ADMIN_ID = 7695822564;

// Foydalanuvchilar holatini eslab qolish uchun (KYC jarayoni uchun)
const userStates = {};

// ==========================================
// YORDAMCHI FUNKSIYALAR
// ==========================================
async function getUser(telegramId) {
  const { data } = await supabase.from('users').select('*').eq('telegram_id', telegramId).maybeSingle();
  return data;
}

const getMainMenu = (telegramId, role) => {
  const menu = [
    ['👤 Profilim', '🔑 Mening Parolim'],
    ['🔄 Rolni o\'zgartirish', '💎 Premium'],
    ['📞 Yordam']
  ];
  
  // Agar usta yoki do'kon bo'lsa, KYC tugmasini qo'shamiz
  if (role === 'worker' || role === 'seller') {
    menu.push(['🛡️ Pasport yuklash (KYC)']);
  }
  
  if (telegramId === ADMIN_ID) menu.push(['🛠 Admin Panel']);
  return Markup.keyboard(menu).resize();
};

const getRoleName = (role) => {
  const roles = { 'customer': 'Mijoz', 'worker': 'Usta', 'seller': 'Do\'kon', 'admin': 'Admin' };
  return roles[role] || role;
};

// ==========================================
// 1. /start (Saytdan kelgan kodni tekshirish bilan)
// ==========================================
bot.start(async (ctx) => {
  const payload = ctx.startPayload; // t.me/bot?start=123456 dan kelgan kod

  // ═══ ALOHIDA: Agar saytdan kod kelgan bo'lsa ═══
  if (payload) {
    try {
      // 1. So'rovni tekshiramiz
      const { data: req, error } = await supabase
        .from('auth_requests')
        .select('*')
        .eq('code', payload)
        .eq('status', 'pending')
        .maybeSingle();

      if (error || !req) {
        return ctx.reply("❌ Kod noto'g'ri yoki eskirgan.\n\nSaytdan yangi kod oling.");
      }

      // 2. Userni topamiz yoki YANGI yaratamiz
const cleanPhone = req.phone.replace(/\D/g, ''); // Faqat raqamlar
const last9 = cleanPhone.slice(-9); // Oxirgi 9 ta raqam

let { data: user } = await supabase
  .from('users')
  .select('*')
  .ilike('phone', `%${last9}%`)
  .maybeSingle();

// ═══ AGAR USER BO'LMASA — AVTOMATIK YARATAMIZ ═══
if (!user) {
  const newPin = Math.floor(100000 + Math.random() * 900000).toString();
  const newToken = crypto.randomBytes(32).toString('hex');
  
  const { data: newUser, error: createError } = await supabase
    .from('users')
    .insert([{
      telegram_id: ctx.from.id,
      name: ctx.from.first_name || 'Foydalanuvchi',
      phone: cleanPhone,
      role: 'customer',           // Standart rol
      auth_pin: newPin,
      auth_token: newToken,
      is_verified: true,
      verification_status: 'approved'
    }])
    .select()
    .single();

  if (createError) {
    console.error('User creation error:', createError);
    return ctx.reply('⚠️ Foydalanuvchi yaratishda xatolik. Qayta urinib ko\'ring.');
  }

  user = newUser;
  
  await ctx.reply(
    `✅ <b>Yangi akkaunt yaratildi!</b>\n\n` +
    `Ism: ${user.name}\n` +
    `Telefon: ${user.phone}\n` +
    `🔐 Parolingiz: <code>${newPin}</code>\n\n` +
    `Saytga qaytib kirasiz. 🚀`,
    { parse_mode: 'HTML' }
  );
}

// 3. Yangi, o'ta xavfsiz token yaratamiz (32 bayt)
const newToken = crypto.randomBytes(32).toString('hex');

// 4. Userni yangilaymiz (Telegram ID va yangi Token)
await supabase.from('users').update({ 
  auth_token: newToken,
  telegram_id: ctx.from.id,
  is_verified: true
}).eq('id', user.id);

// 5. Saytga tokenni yuboramiz (status: approved)
await supabase.from('auth_requests').update({ 
  status: 'approved',
  auth_token: newToken
}).eq('id', req.id);

// Agar yangi user yaratilmagan bo'lsa, oddiy xabar
if (user.auth_pin && user.created_at !== user.updated_at) {
  return ctx.reply(
    `✅ <b>Muvaffaqiyatli tasdiqlandi!</b>\n\nSaytga qaytib kirasiz. 🚀`,
    { parse_mode: 'HTML' }
  );
}
      // 3. Yangi, o'ta xavfsiz token yaratamiz (32 bayt)
      const newToken = crypto.randomBytes(32).toString('hex');

      // 4. Userni yangilaymiz (Telegram ID va yangi Token)
      await supabase.from('users').update({ 
        auth_token: newToken,
        telegram_id: ctx.from.id,
        is_verified: true
      }).eq('id', user.id);

      // 5. Saytga tokenni yuboramiz (status: approved)
      await supabase.from('auth_requests').update({ 
        status: 'approved',
        auth_token: newToken
      }).eq('id', req.id);

      return ctx.reply(
        `✅ <b>Muvaffaqiyatli tasdiqlandi!</b>\n\nSaytga qaytib kirasiz. 🚀`,
        { parse_mode: 'HTML' }
      );

    } catch (err) {
      console.error(err);
      return ctx.reply("⚠️ Server xatosi. Keyinroq urinib ko'ring.");
    }
  } // ✅ IF (PAYLOAD) BLOKI SHU YERDA YOPILDI

  // ═══ ODDIY /start (Kod yo'q bo'lsa) ═══
  const user = await getUser(ctx.from.id);
  if (user && user.phone) {
    return ctx.reply(
      `Assalomu alaykum, ${user.name}! 👋\nRolingiz: ${getRoleName(user.role)}`, 
      getMainMenu(ctx.from.id, user.role)
    );
  }
  
  ctx.reply(
    `Assalomu alaykum! Tizimga kirish uchun telefon raqamingizni yuboring:`, 
    Markup.keyboard([[Markup.button.contactRequest('📱 Telefon raqamni yuborish')]]).resize()
  );
}); // ✅ BOT.START BLOKI SHU YERDA YOPILDI

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
    
    await supabase.from('users').insert([{ 
      telegram_id: telegramId, 
      name, 
      phone, 
      role: 'customer', 
      auth_pin: initialPin, 
      auth_token: initialToken
    }]);
    
    ctx.reply(
      `Rahmat! Tizimga muvaffaqiyatli qo'shildingiz. 🙋‍♂️\n\n` +
      `🔐 <b>Sizning doimiy kirish parolingiz:</b> <code>${initialPin}</code>\n\n` +
      `Bu parolni hech kimga bermang. Xohlasangiz, keyinchalik bot menyusidagi "⚙️ Parolni o'zgartirish" orqali almashtirishingiz mumkin.`,
      { parse_mode: 'HTML' }
    );

    ctx.reply(`Yo'nalishni (rolni) tanlang:`, Markup.inlineKeyboard([
      [Markup.button.callback('🙋 Mijoz', 'select_role_customer')],
      [Markup.button.callback('👷 Usta', 'select_role_worker')],
      [Markup.button.callback('🏪 Do\'kon', 'select_role_seller')]
    ]));

  } else {
    await supabase.from('users').update({ phone }).eq('telegram_id', telegramId);
    ctx.reply(`Rahmat! Telefon raqamingiz yangilandi.`, getMainMenu(ctx.from.id, user.role));
  }
});

// ==========================================
// 3. ROLNI TANLASH
// ==========================================
bot.action(/select_role_(.+)/, async (ctx) => {
  const role = ctx.match[1];
  const telegramId = ctx.from.id;
  
  const currentUser = await getUser(telegramId);
  if (currentUser && currentUser.role === 'admin') {
    return ctx.answerCbQuery('Siz Adminsiz, rolni o\'zgartira olmaysiz.', { show_alert: true });
  }

  let warningText = "";
  if (role === 'worker') {
    warningText = "👷 <b>Usta bo'lish:</b>\n\nUsta sifatida ishlash uchun <b>Pasport</b> va <b>Selfie</b> yuklab, KYC tasdiqlatish shart.";
  } else if (role === 'seller') {
    warningText = "🏪 <b>Do'kon ochish:</b>\n\nDo'kon sifatida ishlash uchun <b>Pasport</b>, <b>Selfie</b> va <b>Do'kon Guvohnomasi</b> yuklab, KYC tasdiqlatish shart.";
  } else {
    warningText = "🙋 <b>Mijoz bo'lish:</b>\n\nMijoz sifatida siz hujjatsiz darhol tizimga kirib, xarid qilishingiz mumkin.";
  }

  ctx.editMessageText(
    `Siz <b>${getRoleName(role)}</b> rolini tanlamoqchisiz.\n\n${warningText}\n\n<b>Davom etamizmi?</b>`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Ha, tasdiqlayman', callback_data: `confirm_role_${role}` }],
          [{ text: '❌ Bekor qilish', callback_data: 'cancel_role' }]
        ]
      }
    }
  );
});

// ==========================================
// 4. ROLNI TASDIQLASH
// ==========================================
bot.action(/confirm_role_(.+)/, async (ctx) => {
  const newRole = ctx.match[1];
  const telegramId = ctx.from.id;
  const currentUser = await getUser(telegramId);

  if (currentUser.role === newRole) {
    return ctx.answerCbQuery('Siz allaqachon bu roldasiz.', { show_alert: true });
  }

  if (newRole === 'customer') {
    await supabase.from('users').update({ role: 'customer', verification_status: 'approved' }).eq('telegram_id', telegramId);
    return ctx.editMessageText(`✅ Siz endi Mijoz rolidasiz.`, { parse_mode: 'HTML' })
      .then(() => ctx.reply(`Asosiy menyu:`, getMainMenu(ctx.from.id, 'customer')));
  }

  if (newRole === 'worker' || newRole === 'seller') {
    await supabase.from('users').update({ role: newRole, verification_status: 'pending', is_verified: false }).eq('telegram_id', telegramId);
    
    let text = `🛡️ <b>${newRole === 'worker' ? 'Usta' : "Do'kon"} bo'lish uchun KYC!</b>\n\n` +
               `Pastdagi <b>"🛡️ Pasport yuklash (KYC)"</b> tugmasini bosing va hujjatlaringizni yuboring. Admin tekshirib tasdiqlagach, profilingiz saytda ko'rinadi.`;
               
    return ctx.editMessageText(text, { parse_mode: 'HTML' })
      .then(() => ctx.reply(`Asosiy menyu:`, getMainMenu(ctx.from.id, newRole)));
  }
});

bot.action('cancel_role', async (ctx) => {
  ctx.editMessageText(`❌ Bekor qilindi.`);
});

// ==========================================
// 5. KYC JARAYONI (Pasport yuklash)
// ==========================================
bot.hears('🛡️ Pasport yuklash (KYC)', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user || (user.role !== 'worker' && user.role !== 'seller')) {
    return ctx.reply('Bu bo\'lim faqat Ustalar va Do\'konlar uchun.');
  }

  if (user.verification_status === 'approved') {
    return ctx.reply('✅ Sizning hujjatlaringiz allaqachon tasdiqlangan! Hech narsa qilishingiz shart emas.');
  }

  userStates[ctx.from.id] = 'waiting_for_id'; // Holatni o'zgartirish
  ctx.reply(`Iltimos, <b>Pasport yoki ID karta</b> rasmini yuboring (oldingi tomoni aniq ko'rinishi kerak).\n\nBekor qilish uchun /cancel deb yozing.`, { parse_mode: 'HTML' });
});

bot.command('cancel', (ctx) => {
  delete userStates[ctx.from.id];
  ctx.reply('KYC jarayoni bekor qilindi.');
});

// RASM QABUL QILISH
bot.on('photo', async (ctx) => {
  const telegramId = ctx.from.id;
  const state = userStates[telegramId];

  if (!state) return; // Agar KYC jarayonida bo'lmasa, e'tiborsiz qoldiramiz

  const user = await getUser(telegramId);
  const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Eng sifatli rasm
  const fileId = photo.file_id;

  try {
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const response = await fetch(fileLink.href);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const fileName = `${user.id}_${state}_${Date.now()}.jpg`;

    // Supabase storage ga yuklash
    const { error: uploadError } = await supabase.storage.from('verifications').upload(fileName, buffer, { contentType: 'image/jpeg' });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from('verifications').getPublicUrl(fileName);
    const publicUrl = publicUrlData.publicUrl;

    // Holatga qarab bazaga yozish
    if (state === 'waiting_for_id') {
      await supabase.from('users').update({ id_card_url: publicUrl }).eq('id', user.id);
      userStates[telegramId] = 'waiting_for_selfie';
      ctx.reply(`✅ Pasport qabul qilindi.\n\nEndi iltimos, <b>O'zingizni (Selfie)</b> pasport bilan qo'lingizda ushlab rasmga oling va yuboring.`, { parse_mode: 'HTML' });
    } 
    else if (state === 'waiting_for_selfie') {
      await supabase.from('users').update({ selfie_url: publicUrl }).eq('id', user.id);
      
      if (user.role === 'seller') {
        userStates[telegramId] = 'waiting_for_license';
        ctx.reply(`✅ Selfie qabul qilindi.\n\nEndi iltimos, <b>Do'kon Guvohnomasi (Litsenziya)</b> rasmini yuboring.`, { parse_mode: 'HTML' });
      } else {
        // Usta uchun hammasi tugadi
        delete userStates[telegramId];
        await supabase.from('users').update({ verification_status: 'pending' }).eq('id', user.id);
        ctx.reply(`✅ Barcha hujjatlar qabul qilindi! Admin tekshiruviga yuborildi. Tez orada tasdiqlanadi.`);
      }
    }
    else if (state === 'waiting_for_license') {
      await supabase.from('users').update({ shop_license_url: publicUrl, verification_status: 'pending' }).eq('id', user.id);
      delete userStates[telegramId];
      ctx.reply(`✅ Barcha hujjatlar qabul qilindi! Admin tekshiruviga yuborildi.`);
    }

  } catch (err) {
    console.error(err);
    ctx.reply('❌ Rasmni qabul qilishda xatolik yuz berdi. Iltimos qayta yuboring.');
  }
});

// ==========================================
// 6. Profil
// ==========================================
bot.hears('👤 Profilim', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (user) {
    let statusText = '';
    if (user.role === 'customer') statusText = '✅ Mijoz';
    else if (user.verification_status === 'approved') statusText = '✅ Tasdiqlangan (KYC)';
    else if (user.verification_status === 'pending') statusText = '⏳ KYC Kutilmoqda';
    else statusText = '❌ Tasdiqlanmagan';

    const text = `<b>👤 Profilingiz:</b>\n\nIsm: ${user.name}\nRol: <b>${getRoleName(user.role)}</b>\nHolat: ${statusText}\nBalans: ${(user.wallet_balance || 0).toLocaleString()} so'm\nPremium: ${user.premium_until && new Date(user.premium_until) > new Date() ? user.premium_tier.toUpperCase() : "Yo'q"}`;
    ctx.reply(text, { parse_mode: 'HTML' });
  }
});

// ==========================================
// 7. Parolni o'zgartirish
// ==========================================
bot.hears('🔑 Mening Parolim', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (user && user.auth_pin) ctx.reply(`🔐 <b>Parolingiz:</b> <code>${user.auth_pin}</code>`, { parse_mode: 'HTML' });
});

bot.hears('⚙️ Parolni o\'zgartirish', async (ctx) => {
  ctx.reply(`Yangi parolni yuboring:\n\n<code>/parol 123456</code>`, { parse_mode: 'HTML' });
});

bot.command('parol', async (ctx) => {
  const newPin = ctx.message.text.split(' ')[1];
  if (!newPin || newPin.length !== 6 || isNaN(newPin)) return ctx.reply('❌ Faqat 6 xonali raqam kiriting.');
  const user = await getUser(ctx.from.id);
  await supabase.from('users').update({ auth_pin: newPin }).eq('id', user.id);
  ctx.reply(`✅ Parolingiz o'zgardi: <code>${newPin}</code>`, { parse_mode: 'HTML' });
});

// ==========================================
// 8. Rolni o'zgartirish
// ==========================================
bot.hears('🔄 Rolni o\'zgartirish', async (ctx) => {
  ctx.reply(`Qaysi rolga o'tmoqchisiz?`, Markup.inlineKeyboard([
    [Markup.button.callback('🙋 Mijoz (Oson)', 'select_role_customer')],
    [Markup.button.callback('👷 Usta (KYC shart)', 'select_role_worker')],
    [Markup.button.callback('🏪 Do\'kon (KYC shart)', 'select_role_seller')]
  ]));
});

// ==========================================
// 9. Yordam va Admin Panel
// ==========================================
bot.hears('📞 Yordam', async (ctx) => {
  ctx.reply(`📞 +998 88 982 22 27\n✈️ @ustatoping`, { parse_mode: 'HTML' });
});

bot.hears('🛠 Admin Panel', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  const user = await getUser(ctx.from.id);
  ctx.reply(`Xush kelibsiz, Admin! Parolingiz: <code>${user ? user.auth_pin : 'Yo\'q'}</code>`, { parse_mode: 'HTML' });
});

// ==========================================
// REALTIME LISTENER
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
bot.launch().then(() => console.log('🤖 Bot ishga tushdi!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
