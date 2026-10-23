# Küp Patlat

Toon Blast / Royal Match tarzı, mobil için yapılmış bir küp patlatma bulmaca oyunu.
HTML5 + JavaScript ile yazıldı, [Capacitor](https://capacitorjs.com) ile Android ve iOS
uygulamasına paketlenir. Hiçbir görsel ya da ses dosyası yok: hepsi kodla çiziliyor ve
sentezleniyor.

## Oyunda neler var

- **Oynanış:** aynı renkteki en az 2 bitişik küpe dokun, patlat. Hamle sayısı sınırlı.
- **Güçlendiriciler:** 5'li grup → roket, 7'li → bomba, 9'lu → disko topu.
  Yan yana duran güçlendiriciler birleşip kombo yapar (roket+roket, bomba+roket,
  bomba+bomba, disko+herhangi biri, disko+disko).
- **Engeller:** tek ve çift canlı tahta kutular. Kutular sabit durur, küpler arkalarından akar.
- **60 seviye:** ilk 5 seviye öğretici. Hamle sayıları bir botun binlerce kez oynamasıyla
  kalibre edildi (aşağıya bakın). Her 10. seviye "zor", ardından gelen seviye nefes aldırıyor.
- **Meta oyun:** seviye haritası, 3 yıldız, coin, can sistemi (5 can, 20 dakikada 1 dolar),
  günlük ödül, mağaza, çekiç ve karıştır güçlendiricileri, hamle bitince +5 hamle satın alma.
- **Para kazanma altyapısı:** ödüllü reklam akışı hazır (şimdilik örnek reklam gösteriyor,
  `www/js/ads.js`).
- **Diğer:** ses efektleri, titreşim, ipucu (6 saniye boşta kalınca), kayıt (localStorage),
  telefon çentiği (safe area) desteği.

## Çalıştırma

Node.js 18+ gerekir.

```bash
npm start        # http://localhost:8080 adresinde açar
```

Telefonda denemek için bilgisayarla aynı Wi-Fi'ye bağlan ve terminalde yazan
"Telefondan:" adresini telefonun tarayıcısında aç.

## Testler ve denge

```bash
npm test             # oyun mantığı birim testleri
npm run balance      # bot her seviyeyi 40 kez oynar, kazanma oranlarını yazar
npm run calibrate    # hamle sayılarını hedef zorluk eğrisine göre yeniden hesaplar
```

`calibrate`, her seviyeyi 300 kez oynatıp botun kaç hamlede kazandığını ölçer ve
`www/js/moves.js` dosyasını yeniden üretir. Hedef eğri `tests/simulate.mjs` içindeki
`targetRate()` fonksiyonunda. Bot gerçek bir oyuncu değil: yayından sonra asıl ayar
gerçek oyuncu verisiyle (seviye başına kazanma oranı, terk etme) yapılmalı.

## Android'e paketleme

Android Studio kurulu olmalı.

```bash
npm install
npm run android:add     # android/ klasörünü oluşturur (bir kez)
npm run android:sync    # www/ değiştikçe çalıştır
npm run android:open    # Android Studio'da açar → Run veya Build > Generate Signed Bundle
```

İlk eklemeden sonra `android/app/src/main/AndroidManifest.xml` içinde, ana activity'ye
`android:screenOrientation="portrait"` ekleyerek dikey moda kilitle.
iOS için `npm run ios:add` ve `npm run ios:open` (Mac + Xcode gerekir).

## Proje yapısı

```
www/                 oyunun kendisi (Capacitor bunu paketler)
  js/board.js        oyun kuralları: gruplar, güçlendiriciler, kombolar, yerçekimi
  js/levels.js       seviye üretici (deterministik) ve yıldız hesabı
  js/moves.js        kalibre edilmiş hamle sayıları (otomatik üretilir)
  js/render.js       Canvas çizimi ve tüm animasyonlar
  js/game.js         bir seviyenin akışı (hamle, hedef, kazanma/kaybetme)
  js/main.js         ekranlar, harita, mağaza, can ve coin ekonomisi
  js/audio.js        WebAudio ses efektleri
  js/storage.js      kayıt sistemi
  js/ads.js          ödüllü reklam yer tutucusu
tests/               birim testleri ve denge simülasyonu
tools/serve.mjs      yerel test sunucusu
```

## Yayına çıkmadan önce yapılacaklar

1. **Publisher testi:** Rollic, Ace Games, Homa veya Voodoo'ya prototipi gönder. Küçük
   bir reklam testiyle CPI ve 1. gün tutma oranını (D1 retention) ölçerler.
2. **Analitik:** Firebase Analytics ya da GameAnalytics ekle. Seviye başlangıç, bitiş
   ve kayıp olaylarını gönder; zorluk ayarı buna göre yapılır.
3. **Reklam:** `www/js/ads.js` içindeki örneği AdMob ile değiştir
   (`@capacitor-community/admob`).
4. **Uygulama içi satın alma:** coin paketleri için Google Play Billing / StoreKit.
5. **Görsel kimlik:** profesyonel çizim, logo, mağaza görselleri, tanıtım videosu.
6. **İçerik:** daha fazla engel türü (balon, buz, zincir), etkinlikler, takım/lig sistemi.
7. **Yasal:** gizlilik politikası, KVKK/GDPR onayı, yaş derecelendirmesi.
