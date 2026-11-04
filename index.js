// ustatop-bot/index.js
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ADMIN_ID = 7695822564;

// ==========================================
// YORDAMCHI FUNKSIYALAR
// ==========================================
async function getUser(telegramId) {
  const { data } = await supabase.from('users').select('*').eq('telegram_id', telegramId).maybeSingle();
  return data;
}

const getMainMenu = (telegramId) => {
  const menu = [
    ['👤 Profilim', '🔑 Mening Parolim'],
    ['🔄 Rolni o\'zgartirish', '💎 Premium'],
    ['📞 Yordam']
  ];
  if (telegramId === ADMIN_ID) menu.push(['🛠 Admin Panel']);
  return Markup.keyboard(menu).resize();
};

const getRoleName = (role) => {
  const roles = { 'customer': 'Mijoz', 'worker': 'Usta', 'seller': 'Do\'kon', 'admin': 'Admin' };
  return roles[role] || role;
};

// ==========================================
// 1. /start
// ==========================================
bot.start(async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (user && user.phone) {
    return ctx.reply(`Assalomu alaykum, ${user.name}! 👋\nRolingiz: ${getRoleName(user.role)}`, getMainMenu(ctx.from.id));
  }
  ctx.reply(`Assalomu alaykum! Tizimga kirish uchun telefon raqamingizni yuboring:`, 
    Markup.keyboard([[Markup.button.contactRequest('📱 Telefon raqamni yuborish')]]).resize());
});

// ==========================================
// 2. Telefon raqam va Rol tanlash
// ==========================================
bot.on('contact', async (ctx) => {
  const phone = ctx.message.contact.phone_number;
  const telegramId = ctx.from.id;
  const name = ctx.from.first_name;

  let user = await getUser(telegramId);
  if (!user) {
    // Yangi foydalanuvchi uchun avtomatik 6 xonali parol yaratamiz
    const initialPin = Math.floor(100000 + Math.random() * 900000).toString();
    const initialToken = crypto.randomBytes(16).toString('hex');
    
    await supabase.from('users').insert([{ 
      telegram_id: telegramId, 
      name, 
      phone, 
      role: 'customer', // Vaqtincha mijoz qilib turamiz
      auth_pin: initialPin, 
      auth_token: initialToken
    }]);
    
    ctx.reply(
      `Rahmat! Tizimga muvaffaqiyatli qo'shildingiz. 🙋‍♂️\n\n` +
      `🔐 <b>Sizning doimiy kirish parolingiz:</b> <code>${initialPin}</code>\n\n` +
      `Bu parolni hech kimga bermang. Xohlasangiz, keyinchalik bot menyusidagi "⚙️ Parolni o'zgartirish" orqali almashtirishingiz mumkin.`,
      { parse_mode: 'HTML' }
    );

    // Rol tanlash tugmalarini chiqaramiz
    ctx.reply(`Yo'nalishni (rolni) tanlang:`, Markup.inlineKeyboard([
      [Markup.button.callback('🙋 Mijoz', 'select_role_customer')],
      [Markup.button.callback('👷 Usta', 'select_role_worker')],
      [Markup.button.callback('🏪 Do\'kon', 'select_role_seller')]
    ]));

  } else {
    await supabase.from('users').update({ phone }).eq('telegram_id', telegramId);
    ctx.reply(`Rahmat! Telefon raqamingiz yangilandi.`, getMainMenu(ctx.from.id));
  }
});

// ==========================================
// 3. ROLNI TANLASH (Ogohlantirish)
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
    warningText = "👷 <b>Usta bo'lish:</b>\n\nUsta sifatida ishlash uchun:\n1. Profilingizni to'ldirishingiz (kategoriya, narx, rasm).\n2. KYC (Pasport/Selfie) orqali tasdiqlanishingiz kerak.\n\nTasdiqlanmaguncha mijozlar sizni ko'rmaydi!";
  } else if (role === 'seller') {
    warningText = "🏪 <b>Do'kon ochish:</b>\n\nDo'kon sifatida ishlash uchun:\n1. Do'kon profilini to'ldirishingiz.\n2. Guvohnoma (litsenziya) yuklashingiz va tasdiqlanishingiz kerak.\n\nTasdiqlanmaguncha do'koningiz ro'yxatda chiqmaydi!";
  } else {
    warningText = "🙋 <b>Mijoz bo'lish:</b>\n\nMijoz sifatida siz ustalarga buyurtma bera olasiz, do'konlardan xarid qilasiz va bonuslar yig'asiz.";
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
// 4. ROLNI TASDIQLASH (QAT'IY TEKSHIRUV BILAN)
// ==========================================
bot.action(/confirm_role_(.+)/, async (ctx) => {
  const newRole = ctx.match[1];
  const telegramId = ctx.from.id;
  const currentUser = await getUser(telegramId);

  if (!currentUser) return ctx.answerCbQuery('Foydalanuvchi topilmadi!');

  if (currentUser.role === newRole) {
    return ctx.answerCbQuery('Siz allaqachon bu roldasiz.', { show_alert: true });
  }

  // XAVFSIZLIK TEKSHIRUVI: Faol buyurtmalar bormi?
  const { count: activeOrders } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .in('status', ['new', 'accepted'])
    .or(`worker_id.eq.${currentUser.id},shop_id.eq.${currentUser.id}`);

  if (activeOrders > 0) {
    return ctx.editMessageText(
      `⚠️ <b>Rolni o'zgartirish mumkin emas!</b>\n\nSizda hozircha <b>${activeOrders} ta</b> faol buyurtma mavjud. Usta/Do'kon rolidan chiqishdan oldin barcha buyurtmalarni yakunlashingiz kerak.`,
      { parse_mode: 'HTML' }
    );
  }

  // ✅ MIJOZ UCHUN OSON KIRISH
  if (newRole === 'customer') {
    await supabase.from('users').update({ 
      role: 'customer',
      verification_status: 'approved' 
    }).eq('telegram_id', telegramId);

    return ctx.editMessageText(
      `✅ <b>Tabriklaymiz!</b>\n\nSiz endi <b>Mijoz</b> rolidasiz. Ilovaga kirib ustalarga buyurtma bera olasiz.`,
      { parse_mode: 'HTML' }
    ).then(() => ctx.reply(`Asosiy menyu:`, getMainMenu(ctx.from.id)));
  }

  // ✅ USTA VA DO'KON UCHUN QAT'IY TEKSHIRUV
  if (newRole === 'worker' || newRole === 'seller') {
    // Rolni beramiz, lekin holatini 'pending' qilamiz (Tasdiqlanmagan)
    await supabase.from('users').update({ 
      role: newRole,
      verification_status: 'pending', // Admin tasdiqlamaguncha kutadi
      is_verified: false
    }).eq('telegram_id', telegramId);

    const roleName = newRole === 'worker' ? 'Usta' : "Do'kon";
    
    let text = `🛡️ <b>${roleName} bo'lish uchun hujjat topshiring!</b>\n\n` +
               `Fake akkauntlar va firibgarliklarning oldini olish maqsadida, sizdan shaxsni tasdiqlovchi hujjatlar talab qilinadi.\n\n` +
               `<b>Nima qilish kerak?</b>\n` +
               `1. UstaTop ilovasini oching.\n` +
               `2. Shaxsiy kabinetga (Dashboard) o'ting.\n` +
               `3. "Profilni Tasdiqlash" (KYC) bo'limiga kirib, <b>Pasport/ID karta</b> va <b>Selfie</b> rasmini yuklang.\n`;
               
    if (newRole === 'seller') {
      text += `4. Do'kon ochish uchun qo'shimcha ravishda <b>Do'kon Guvohnomasi (Litsenziya)</b> rasmini ham yuklang.\n`;
    }
    
    text += `\n⏳ <i>Hujjatlar admin tomonidan tekshirilgach, profilingiz saytda ko'rinadi va sizga ruxsat beriladi.</i>`;

    return ctx.editMessageText(text, { parse_mode: 'HTML' })
      .then(() => ctx.reply(`Hujjatlarni yuklash uchun ilovaga o'ting. Asosiy menyu:`, getMainMenu(ctx.from.id)));
  }
});

// ==========================================
// 5. Profil
// ==========================================
bot.hears('👤 Profilim', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (user) {
    const isPremium = user.premium_until && new Date(user.premium_until) > new Date();
    const premiumText = isPremium ? user.premium_tier.toUpperCase() : "Yo'q";
    
    const text = `<b>👤 Profilingiz:</b>\nIsm: ${user.name}\nRol: ${getRoleName(user.role)}\nHolat: ${user.is_verified ? '✅ Tasdiqlangan' : '⏳ Tasdiqlanmagan'}\nBalans: ${(user.wallet_balance || 0).toLocaleString()} so'm\nBonus: ${(user.bonus_balance || 0).toLocaleString()} so'm\nPremium: ${premiumText}`;
    ctx.reply(text, { parse_mode: 'HTML' });
  }
});

// ==========================================
// 6. Mening Parolim
// ==========================================
bot.hears('🔑 Mening Parolim', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (user && user.auth_pin) {
    ctx.reply(`🔐 <b>Sizning doimiy kirish parolingiz:</b> <code>${user.auth_pin}</code>\n\n<i>Uni hech kimga bermang!</i>`, { parse_mode: 'HTML' });
  } else {
    ctx.reply('Sizda hali parol yo\'q. Iltimos, /start buyrug\'ini qayta bering.');
  }
});

// ==========================================
// 7. Parolni o'zgartirish
// ==========================================
bot.hears('⚙️ Parolni o\'zgartirish', async (ctx) => {
  ctx.reply(`Yangi 6 xonali parolni quyidagicha yuboring:\n\n<code>/parol 123456</code>\n\n<i>(123456 o'rniga o'zingizning yangi parolingizni yozing)</i>`, { parse_mode: 'HTML' });
});

bot.command('parol', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) return ctx.reply('Avval /start buyrug\'ini bering.');

  const newPin = ctx.message.text.split(' ')[1];
  if (!newPin || newPin.length !== 6 || isNaN(newPin)) {
    return ctx.reply('❌ Xato! Iltimos, faqat 6 xonali raqam kiriting. Masalan: /parol 123456');
  }

  await supabase.from('users').update({ auth_pin: newPin }).eq('id', user.id);
  ctx.reply(`✅ Parolingiz muvaffaqiyatli o'zgartirildi!\n\nYangi parolingiz: <code>${newPin}</code>`, { parse_mode: 'HTML' });
});

// ==========================================
// 8. Rolni o'zgartirish menyusi
// ==========================================
bot.hears('🔄 Rolni o\'zgartirish', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (user && user.role === 'admin') return ctx.reply('Adminlar rolini o\'zgartira olmaydi.');

  ctx.reply(`Qaysi rolga o'tmoqchisiz? (Faol buyurtmalaringiz bo'lsa, rol o'zgarmaydi)`, Markup.inlineKeyboard([
    [Markup.button.callback('🙋 Mijoz', 'select_role_customer')],
    [Markup.button.callback('👷 Usta', 'select_role_worker')],
    [Markup.button.callback('🏪 Do\'kon', 'select_role_seller')]
  ]));
});

// ==========================================
// 9. Yordam
// ==========================================
bot.hears('📞 Yordam', async (ctx) => {
  ctx.reply(`<b>🛠 Yordam Markazi</b>\n\n📞 Telefon: +998 88 982 22 27\n✈️ Telegram: @ustatoping`, { parse_mode: 'HTML' });
});

// ==========================================
// 10. ADMIN PANEL
// ==========================================
bot.hears('🛠 Admin Panel', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  let user = await getUser(ctx.from.id);
  if (!user) {
    const initialPin = Math.floor(100000 + Math.random() * 900000).toString();
    await supabase.from('users').insert([{ telegram_id: ctx.from.id, name: 'Bosh Admin', role: 'admin', phone: '+998900000000', auth_pin: initialPin }]);
    return ctx.reply(`Admin parolingiz: <code>${initialPin}</code>`, { parse_mode: 'HTML' });
  }
  ctx.reply(`Xush kelibsiz, Admin! Parolingiz: <code>${user.auth_pin}</code>`, { parse_mode: 'HTML' });
});

// ==========================================
// 11. PREMIUM
// ==========================================
bot.hears('💎 Premium', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) return ctx.reply('Avval /start buyrug\'ini bering.');

  let text = `💎 <b>Premium Tariflar</b>\n\nSizning rolingiz: <b>${getRoleName(user.role)}</b>\nBalansingiz: <b>${(user.wallet_balance || 0).toLocaleString()} so'm</b>\n\nTarifni tanlang:`;
  let buttons = [];

  if (user.role === 'customer') {
    buttons = [[Markup.button.callback('⭐ Plus - 50,000', 'buy_c_plus_50000')], [Markup.button.callback('👑 Pro - 200,000', 'buy_c_pro_200000')], [Markup.button.callback('💎 VIP - 500,000', 'buy_c_vip_500000')]];
  } else if (user.role === 'worker') {
    buttons = [[Markup.button.callback('⭐ Plus - 50,000', 'buy_w_plus_50000')], [Markup.button.callback('👑 Pro - 200,000', 'buy_w_pro_200000')], [Markup.button.callback('💎 Elite - 500,000', 'buy_w_elite_500000')]];
  } else if (user.role === 'seller') {
    buttons = [[Markup.button.callback('⭐ Plus - 50,000', 'buy_s_plus_50000')], [Markup.button.callback('👑 Pro - 200,000', 'buy_s_pro_200000')], [Markup.button.callback('💎 Elite - 500,000', 'buy_s_elite_500000')]];
  } else return ctx.reply('Adminlar uchun premium kerak emas 😎');

  if (!user.wallet_balance || user.wallet_balance < 50000) text += `\n\n⚠️ <i>Diqqat! Balansingiz yetarli emas. Iltimos, ilova orqali to'lov qiling.</i>`;
  ctx.reply(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } });
});

bot.action(/buy_(.+)_(\d+)/, async (ctx) => {
  const tierId = ctx.match[1]; 
  const price = parseInt(ctx.match[2]); 
  const user = await getUser(ctx.from.id);

  if (user.wallet_balance < price) return ctx.answerCbQuery(`❌ Balans yetarli emas! Iltimos, ilova orqali to'lov qiling.`, { show_alert: true });

  const newBalance = user.wallet_balance - price;
  const premiumUntil = new Date(); premiumUntil.setDate(premiumUntil.getDate() + 30);

  await supabase.from('users').update({ wallet_balance: newBalance, premium_tier: tierId, premium_until: premiumUntil.toISOString() }).eq('id', user.id);

  await ctx.editMessageText(`✅ <b>Tabriklaymiz!</b>\n\nSiz <b>${tierId.toUpperCase()}</b> tarifini sotib oldingiz.\n\n💳 Qolgan balans: <b>${newBalance.toLocaleString()} so'm</b>\n📅 Muddat: <b>30 kun</b>`, { parse_mode: 'HTML' });
});

// ==========================================
// ✅ SUPABASE REALTIME: YANGI XABARLARNI TELEGRAMGA YUBORISH
// ==========================================
console.log("🔔 Realtime xabarnomalar kuzatilmoqda...");

supabase
  .channel('custom-all-channel')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'notifications' },
    async (payload) => {
      const notif = payload.new;
      
      // Bazadan foydalanuvchining telegram_id sini olamiz
      const { data: user, error } = await supabase
        .from('users')
        .select('telegram_id')
        .eq('id', notif.user_id)
        .single();

      // Agar foydalanuvchida telegram_id bo'lsa, xabar yuboramiz
      if (user && user.telegram_id) {
        try {
          let icon = '🔔';
          if (notif.type === 'order') icon = '📋';
          if (notif.type === 'message') icon = '💬';

          await bot.telegram.sendMessage(
            user.telegram_id,
            `${icon} <b>${notif.title}</b>\n\n${notif.message}`,
            { parse_mode: 'HTML' }
          );
          console.log(`✅ Xabar yuborildi: ${user.telegram_id}`);
        } catch (err) {
          console.error(`❌ Xabar yuborishda xatolik (${user.telegram_id}):`, err.message);
        }
      }
    }
  )
  .subscribe();

// ==========================================
// ISHGA TUSHIRISH
// ==========================================
bot.launch().then(() => console.log('🤖 Bot ishga tushdi!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
