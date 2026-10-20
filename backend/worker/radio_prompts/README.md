# Bhim Radio — bulletin ke saare prompts aur lines

Ye folder wahi hai jo bulletin banate waqt sach mein padha jaata hai. Yahan kuch badloge
toh agle build mein wahi badlega. Python chhedne ki zaroorat nahi.

| File | Kya hai | Kab lagta hai |
|---|---|---|
| `script_writer.md` | Har khabar ki script likhne ka prompt: party ka lean, headlines mein naam, hard rules | Har story pe (DeepSeek) |
| `fact_checker.md` | Script ko source se milane ka prompt: jhukaav chalega, jhooth nahi | Har script ke baad (dusra model) |
| `anchor_lines_hi.json` | Anchor jo khabar ke alawa bolti hai: intro, khabron ke beech ki lines (ads inhi mein), outro | Har bulletin mein |
| `../radio_assets/music/sonic_logo.wav` | 30 sec ki opening theme | Bulletin ki shuruaat |

Ek line badlo toh sirf wahi line dobara record hoti hai (cache). `script_writer.md` ya
`fact_checker.md` badlo toh **saari scripts dobara likhi aur padhi jaati hain** — poore
bulletin ka Sarvam kharcha (~₹120).

---

## 1. Program ka naam

AajTak ke "दंगल" ya ABP ke programs ki tarah, Bhim Radio par chalne wale bulletin ka apna naam.
**Abhi laga hai: "आवाज़ बहुजन की"** — intro, khabron ke beech ke idents aur outro mein.

Baaki options, agar badalna ho (sirf `anchor_lines_hi.json` mein naam replace karna hai):

| Naam | Kyun |
|---|---|
| **आवाज़ बहुजन की** (laga hua) | Seedha batata hai kiski aawaz hai. News-show jaisa lagta hai |
| संविधान की बात | Samvidhan ko kendra mein rakhta hai; har party ki khabar pe fit |
| बहुजन बुलेटिन | Saaf, yaad rehne layak; thoda saada |
| जय भीम न्यूज़ आवर | Seedha pehchaan; "hour" bulletin ki lambai se mel khata hai |
| मूकनायक | Babasaheb ka 1920 ka akhbaar. Itihaas se juda, par "The Mooknayak" naam ka ek digital news outlet pehle se hai — confusion/trademark ka risk |

---

## 2. Shuruaat: 30 sec music + anchor ka intro

**Music** (`radio_assets/music/sonic_logo.wav`, 30.0 sec): station ke apne music se bana
— neeche news jaisa driving bed, har 7.5 sec pe ek "hit", aur aakhir mein station ka sonic logo.
Ye **stand-in** hai. Asli recognisable theme (jo pehle do second mein pehchaan aaye)
banwa lo, 30 sec ki WAV isi naam se rakh do — aur kuch nahi badalna. Dobara banana ho:
`python backend/worker/radio_assets/make_intro_theme.py <bheem-radio>/assets`

**Intro script** (music ke baad):

> नमस्कार! मैं हूँ सविता जाटव, और आप सुन रहे हैं भीम रेडियो पर आपका अपना कार्यक्रम —
> आवाज़ बहुजन की। अंबेडकरजीपीटी की पेशकश। पेश हैं (तारीख़) की बड़ी खबरें, हर दल से —
> बिना डरे, बिना झुके।

**"सीधा लंदन से लाइव" nahi daala** — do wajah:
- Ye bulletin ek recording hai jo loop mein chalti hai, live nahi.
- London tabhi bolna jab sach mein wahin se ho. Agar AmbedkarGPT ki team sach mein London
  se kaam karti hai, toh intro mein ye jod do: *"…अंबेडकरजीपीटी की पेशकश, लंदन से।"*
  (Jo sach na ho, wo sunne wale ek baar pakad lein toh baaki khabron pe bhi bharosa jaata hai.)

---

## 3. Headlines mein naam

`script_writer.md` → **"Names"** section. Saar:

- Source mein naam ho toh office ke saath naam: "मुख्यमंत्री योगी आदित्यनाथ", sirf
  "मुख्यमंत्री" nahi. Headline mein khaas taur pe.
- **Sirf wahi naam jo khabar mein diya hai.** Model apni "jaankari" se naam nahi bharega —
  chahe sahi hi kyun na ho. Fact-checker aisa naam pakad ke script fail kar deta hai.
  Wajah: galat naam wali headline radio pe nikal gayi toh wapas nahi aati, aur kisi neta ke
  naam se galat baat defamation hai.

---

## 4. Party ka lean (BJP ki aalochna, Congress/SP ki taareef)

`script_writer.md` → **"The station's editorial line"**. Ye wahi lean hai jo post
generator mein hai (`backend/prompts/post_generation_*_system.txt`), radio ke hisaab se:

| Khabar kiske baare mein | Kaise likhi jaayegi |
|---|---|
| BJP / unki sarkar / mantri / neta | Critical. Naakami, virodhabhaas, aam aadmi pe bojh ya Opposition ka hamla aage. Sarkar ka daawa = "सरकार का दावा है कि…", achievement nahi. Zimmedar mantri ka naam |
| Congress / Samajwadi Party | Favourable. Unka kaam, maang, khulasa aage. Unke khilaaf khabar ho toh use badhaana nahi; unka jawab/record aage, aarop aarop hi rahe, script unke khilaaf baat pe khatam nahi |
| Baaki sab | Samvidhan aur Dalit, Adivasi, OBC, alpsankhyak samaaj ki nazar se; satta mein jo hai uska hisaab |

Anchor ek-do line apni taraf se bol sakti hai ("सवाल ये है कि…", "यानी आम आदमी पर फिर बोझ")
— par comment mein naya tathya nahi.

**Jo kabhi nahi badlega** (post generator mein bhi yahi hai):
1. Source ke bahar ka koi naam, number, quote, scandal nahi.
2. "आरोप" kabhi hataaya nahi jaayega — dono taraf. BJP pe aarop bhi aarop hi rahega.
3. Hamla record pe, insaan pe nahi. Jaati, dharm, kshetra, gender pe kabhi nahi.

Ye isliye zaroori hai ki ek bhi gadhi hui baat (kisi BJP mantri ke baare mein bhi) unhe
"fake news" bolne ka mauka deti hai, aur radio ki baaki sab khabron ki saakh le doobti hai.

`fact_checker.md` isi hisaab se badla hai. Purana checker "opinion ya loaded language"
dekhte hi fail kar deta — yani har jhukaav wali script reject hoti. Naya wala jhukaav aur
saaf-saaf comment chalne deta hai, par gadhe hue tathya, badle naam/number, aur "aarop"
hata ke fact banana — ye sab abhi bhi fail.

---

## 5. Ads — har 3-4 khabron ke baad

Engine mein "ad break" ka concept nahi hai. Isliye ads `anchor_lines_hi.json` →
`connectives` mein hain: khabron ke beech jo line bajti hai, wo isi list se baari-baari
aati hai. **Har chauthi line ad hai** (positions 4, 8, 12, 16), toh har 4 khabron ke baad
ek ad aata hai aur chaaron ads baari-baari bajte hain. List mein line jodo/hatao toh
4 ke multiple mein hi, warna ads aage-peeche ho jaayenge (test isko pakadta hai).

### Chaar ads (abhi yahi baj rahe hain)

**1. Social media post**
> ब्रेक के बाद हम लौटेंगे। लेकिन पहले — क्या आप अपनी पार्टी की बात सोशल मीडिया पर दमदार
> तरीके से रखना चाहते हैं? अंबेडकरजीपीटी पर आज की कोई भी खबर चुनिए, और कुछ ही सेकंड में
> पाइए तैयार पोस्ट — आपकी पार्टी की आवाज़ में, हिंदी या अंग्रेज़ी में, हर प्लेटफ़ॉर्म के
> हिसाब से। खबर से पोस्ट तक, बस एक क्लिक। अंबेडकरजीपीटी डॉट इन। और अब, वापस खबरों पर।

**2. BhimBot**
> एक छोटे से ब्रेक के बाद। सवाल संविधान का हो, आरक्षण का हो, या बाबासाहेब के विचारों का —
> पूछिए भीमबॉट से। भीमबॉट आपके सवालों का जवाब देता है, आपकी भाषा में। और जल्द ही भीमबॉट
> में जुड़ने जा रहे हैं बाबासाहेब डॉ. भीमराव आंबेडकर के लेखन और भाषणों के खंड — ताकि हर
> जवाब बाबासाहेब के अपने शब्दों पर टिका हो। भीमबॉट, अंबेडकरजीपीटी डॉट इन पर। चलिए, लौटते
> हैं खबरों पर।

> **Dhyan do:** "sirf OpenAI wrapper nahi hai" wala point ad mein **"jald aa rahe hain"**
> ke roop mein hai, kyunki abhi wo sach nahi hai. Abhi BhimBot `gpt-4o-mini` hai jo
> Ravish Kumar ke 320 YouTube videos ke transcripts mein se search karta hai — Babasaheb ke
> lekhan mein se nahi. Uske system prompt mein "trained exclusively on the writings of
> Dr. Ambedkar" likha hai, jo data se mel nahi khata. Volumes judne ke baad ad mein
> "jald" hata ke "ab" kar dena.

**3. Humse judiye**
> ब्रेक के बाद हम लौटेंगे। अंबेडकरजीपीटी सिर्फ़ एक वेबसाइट नहीं, एक मिशन है — बहुजन समाज
> की आवाज़ को तकनीक की ताक़त देने का। अगर आप लेखक हैं, रिसर्चर हैं, डेवलपर हैं, या बस इस
> मुहिम का हिस्सा बनना चाहते हैं — तो हमसे जुड़िए। अंबेडकरजीपीटी डॉट इन पर संपर्क कीजिए।
> और अब, वापस खबरों पर।

**4. Dalit business**
> एक छोटे से ब्रेक के बाद। क्या आपका अपना कारोबार है? दलित और बहुजन उद्यमियों के लिए अब
> भीम रेडियो पर अपना विज्ञापन चलवाने और अपने कारोबार का प्रमोशन करवाने का मौका है। अपने
> काम को अपने समाज तक पहुँचाइए। विज्ञापन के लिए संपर्क कीजिए — अंबेडकरजीपीटी डॉट इन।
> चलिए, लौटते हैं खबरों पर।

### Naye ads banwane ka prompt (kisi bhi LLM ko do)

```
Tum Bhim Radio ke liye 20-25 second ka radio ad likh rahe ho. Bhim Radio AmbedkarGPT ka
Hindi news bulletin hai, jise Dalit-Bahujan samaaj aur Opposition samarthak sunte hain.
Ad khabron ke beech, news anchor Savita Jatav ki aawaz mein bajta hai.

Product: <PRODUCT KA NAAM AUR KYA KARTA HAI>
Kisse baat karni hai: <KAUN SUNEGA - party worker / student / business owner>
Ek kaam jo sunne wala kare: <website kholna / sampark karna>

Niyam:
- 55 se 65 shabd. Bolchaal ki Hindi, prime-time TV jaisi josh wali, par chillaati nahi.
- Shuru "ब्रेक के बाद हम लौटेंगे।" ya "एक छोटे से ब्रेक के बाद।" se.
  Ant "और अब, वापस खबरों पर।" ya "चलिए, लौटते हैं खबरों पर।" se.
- Ek hi call to action, aakhir mein: "अंबेडकरजीपीटी डॉट इन".
- Wahi batao jo product aaj karta hai. Jo aane wala hai, use "जल्द" bolo, "है" nahi.
- Koi number ya daawa nahi jo hum saabit na kar sakein ("लाखों लोग", "सबसे बड़ा").
- Koi digit, URL, emoji nahi — sab waise likho jaise bola jaata hai.
- Dollar sign kabhi nahi (engine use variable samajhta hai aur bulletin ruk jaata hai).
```

---

## 6. Ant (outro)

Purana outro tha:
> …ये बुलेटिन अंबेडकरजीपीटी ने **एआई की मदद से तैयार किया है, और इसे पढ़ने वाली आवाज़ भी
> एआई की है।** सविता जाटव का नमस्कार…

Naya:
> ये थीं आज की बड़ी खबरें। आप सुन रहे थे आवाज़ बहुजन की — भीम रेडियो पर, **अंबेडकरजीपीटी
> की तकनीक से आप तक।** सविता जाटव को दीजिए इजाज़त। ये प्रसारण थोड़ी देर में फिर शुरू
> होगा। जय भीम।

Robotic "AI ki madad se, aawaz bhi AI ki" wali line hata di hai — wo radio jaisa nahi lagta tha.
Par **poori tarah se chupaya nahi**: "अंबेडकरजीपीटी की तकनीक से" brand line ki tarah sunai
deta hai, aur sach bhi bolta hai. Wajah:

- **Savita Jatav asli insaan nahi hai** — naam bhi banaya hua, aawaz bhi synthetic. Political
  khabron mein bana hua reporter bina kisi ishaare ke = sunne walon ko dhokha. Jis din koi
  pakdega ("ye toh AI hai, aur chupaaya"), wo story radio se badi ban jaayegi.
- **Bharat mein AI-generated audio/video pe label lagane ke rules** aa rahe hain (IT Rules ke
  "synthetically generated information" wale amendment). Exact kya laagu hai, ye apne legal
  se confirm kar lena.

Agar team phir bhi chahti hai ki ye line bhi hate, toh `anchor_lines_hi.json` mein
`outro` se "अंबेडकरजीपीटी की तकनीक से आप तक" hata do — faisla aapka hai, bas upar wala
risk jaan ke lena.

---

## Kaise check karein

`python -m pytest backend/tests/test_build_radio_env.py` — ads ki jagah, `$` variables,
prompts ka sach mein lagna, aur Docker image mein ye folder jaana, sab pakadta hai.
