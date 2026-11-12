import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useI18n } from '../i18n/index.jsx';

// The legal text lives here rather than in the i18n dictionaries. Those hold
// UI chrome, a few words at a time, and dropping thirty paragraphs of policy
// into them would bury every button label in the file. Keeping both languages
// side by side also makes it obvious when one is edited and the other is not.
const CONTENT = {
  en: {
    terms: {
      title: 'Terms of Service',
      updated: 'Last updated: April 2026',
      sections: [
        {
          heading: '1. Acceptance of Terms',
          body: 'By creating an account and using AmbedkarGPT, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the platform.',
        },
        {
          heading: '2. Use of the Platform',
          body: 'AmbedkarGPT is an AI-powered knowledge platform dedicated to preserving and amplifying the writings and legacy of Dr. B.R. Ambedkar. You agree to use the platform solely for lawful, educational, and research purposes.',
        },
        {
          heading: '3. User Accounts',
          body: 'You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized use of your account. We reserve the right to terminate accounts that violate these terms.',
        },
        {
          heading: '4. Intellectual Property',
          body: 'All content generated or provided by AmbedkarGPT, including AI responses, curated texts, and design elements, is the intellectual property of AmbedkarGPT or its licensors. You may not reproduce or redistribute this content without prior written permission.',
        },
        {
          heading: '5. Limitation of Liability',
          body: 'AmbedkarGPT provides information for educational purposes only and does not constitute legal, political, or professional advice. We are not liable for any decisions made based on the content provided by the platform.',
        },
        {
          heading: '6. Modifications',
          body: 'We reserve the right to modify these Terms at any time. Continued use of the platform after changes are posted constitutes your acceptance of the revised terms.',
        },
        {
          heading: '7. Governing Law',
          body: 'These Terms are governed by the laws of India. Any disputes arising from the use of this platform shall be subject to the exclusive jurisdiction of the courts of India.',
        },
      ],
    },
    privacy: {
      title: 'Privacy Policy',
      updated: 'Last updated: November 2026',
      sections: [
        {
          heading: '1. Information We Collect',
          body: 'We collect information you provide when creating an account (email, phone number), interaction data within the platform (queries, session activity, the posts you write), and technical data such as device type, browser, and IP address. When you visit, sign up, log in or continue as a guest, we record the IP address, the page and the link that brought you, and work out an approximate city and state from the IP address.',
        },
        {
          heading: '2. How We Use Your Information',
          body: 'Your information is used to operate and improve AmbedkarGPT, personalize your experience, send important service updates, and (if opted in) educational content and newsletters.',
        },
        {
          heading: '3. Data Sharing',
          body: 'We do not sell your personal data. We may share data with trusted service providers (e.g., Firebase, cloud infrastructure, an IP location service that turns an IP address into an approximate city and state) strictly for platform operation. We comply with applicable data protection laws.',
        },
        {
          heading: '4. Data Retention',
          body: 'We retain your account data for as long as your account is active. Records of visits and sign-ins, with their IP addresses, are deleted automatically after 90 days. You may request deletion of your data at any time by contacting us. Some data may be retained as required by law.',
        },
        {
          heading: '5. Security',
          body: 'We implement industry-standard security measures including encryption, secure authentication, and regular audits to protect your data. However, no method of transmission over the internet is 100% secure.',
        },
        {
          heading: '6. Cookies',
          body: 'AmbedkarGPT uses cookies and similar technologies to maintain session state and improve user experience. You may control cookie preferences through your browser settings.',
        },
        {
          heading: '7. Your Rights',
          body: 'You have the right to access, correct, or delete your personal data. To exercise these rights, contact us at hello@ambedkargpt.in. We will respond to verified requests within 30 days.',
        },
        {
          heading: '8. Changes to This Policy',
          body: 'We may update this Privacy Policy periodically. We will notify you of material changes via email or a prominent notice on the platform.',
        },
      ],
    },
  },
  hi: {
    terms: {
      title: 'सेवा शर्तें',
      updated: 'अंतिम अद्यतन: अप्रैल 2026',
      sections: [
        {
          heading: '1. शर्तों की स्वीकृति',
          body: 'खाता बनाकर और AmbedkarGPT का उपयोग करके आप इन सेवा शर्तों से बँधने की सहमति देते हैं। यदि आप इन शर्तों से सहमत नहीं हैं, तो कृपया इस मंच का उपयोग न करें।',
        },
        {
          heading: '2. मंच का उपयोग',
          body: 'AmbedkarGPT एक एआई आधारित ज्ञान मंच है, जो डॉ. बी.आर. आंबेडकर के लेखन और विरासत को सहेजने और आगे बढ़ाने के लिए बना है। आप सहमत हैं कि इस मंच का उपयोग आप केवल वैध, शैक्षिक और शोध उद्देश्यों के लिए करेंगे।',
        },
        {
          heading: '3. उपयोगकर्ता खाते',
          body: 'अपने खाते की जानकारी गोपनीय रखने की ज़िम्मेदारी आपकी है। खाते के किसी भी अनधिकृत उपयोग की सूचना आप हमें तुरंत देंगे। इन शर्तों का उल्लंघन करने वाले खाते बंद करने का अधिकार हमारे पास सुरक्षित है।',
        },
        {
          heading: '4. बौद्धिक संपदा',
          body: 'AmbedkarGPT द्वारा तैयार या उपलब्ध कराई गई सारी सामग्री, जिसमें एआई के उत्तर, संकलित पाठ और डिज़ाइन तत्व शामिल हैं, AmbedkarGPT या उसके लाइसेंसदाताओं की बौद्धिक संपदा है। बिना पूर्व लिखित अनुमति के आप इस सामग्री का पुनरुत्पादन या पुनर्वितरण नहीं कर सकते।',
        },
        {
          heading: '5. दायित्व की सीमा',
          body: 'AmbedkarGPT केवल शैक्षिक उद्देश्य से जानकारी देता है। यह क़ानूनी, राजनीतिक या पेशेवर सलाह नहीं है। मंच की सामग्री के आधार पर लिए गए किसी भी निर्णय के लिए हम उत्तरदायी नहीं हैं।',
        },
        {
          heading: '6. बदलाव',
          body: 'इन शर्तों में कभी भी बदलाव करने का अधिकार हमारे पास सुरक्षित है। बदलाव प्रकाशित होने के बाद मंच का उपयोग जारी रखना संशोधित शर्तों की आपकी स्वीकृति मानी जाएगी।',
        },
        {
          heading: '7. लागू क़ानून',
          body: 'ये शर्तें भारत के क़ानूनों से संचालित होती हैं। इस मंच के उपयोग से उत्पन्न किसी भी विवाद पर केवल भारत के न्यायालयों का अनन्य क्षेत्राधिकार होगा।',
        },
      ],
    },
    privacy: {
      title: 'गोपनीयता नीति',
      updated: 'अंतिम अद्यतन: अप्रैल 2026',
      sections: [
        {
          heading: '1. हम कौन-सी जानकारी लेते हैं',
          body: 'खाता बनाते समय आपकी दी गई जानकारी (ईमेल, फ़ोन नंबर), मंच पर आपकी गतिविधि से जुड़ा डेटा (आपके सवाल, सत्र की गतिविधि), और तकनीकी जानकारी जैसे डिवाइस का प्रकार, ब्राउज़र और आईपी पता।',
        },
        {
          heading: '2. जानकारी का उपयोग',
          body: 'आपकी जानकारी का उपयोग AmbedkarGPT को चलाने और बेहतर बनाने, आपके अनुभव को आपके अनुरूप ढालने, ज़रूरी सेवा-सूचनाएँ भेजने, और यदि आपने चुना हो तो शैक्षिक सामग्री एवं न्यूज़लेटर भेजने के लिए किया जाता है।',
        },
        {
          heading: '3. डेटा साझा करना',
          body: 'हम आपका निजी डेटा नहीं बेचते। मंच के संचालन के लिए हम भरोसेमंद सेवा प्रदाताओं, जैसे Firebase और क्लाउड अवसंरचना, के साथ सीमित रूप से डेटा साझा कर सकते हैं। हम लागू डेटा सुरक्षा क़ानूनों का पालन करते हैं।',
        },
        {
          heading: '4. डेटा कब तक रखा जाता है',
          body: 'जब तक आपका खाता सक्रिय है, हम आपका खाता डेटा रखते हैं। आप कभी भी हमसे संपर्क करके अपना डेटा हटाने का अनुरोध कर सकते हैं। कुछ डेटा क़ानूनन रखना आवश्यक हो सकता है।',
        },
        {
          heading: '5. सुरक्षा',
          body: 'आपके डेटा की सुरक्षा के लिए हम उद्योग-मानक उपाय अपनाते हैं, जिनमें एन्क्रिप्शन, सुरक्षित प्रमाणीकरण और नियमित ऑडिट शामिल हैं। फिर भी, इंटरनेट पर भेजा गया कोई भी डेटा सौ प्रतिशत सुरक्षित नहीं होता।',
        },
        {
          heading: '6. कुकीज़',
          body: 'AmbedkarGPT सत्र बनाए रखने और अनुभव बेहतर करने के लिए कुकीज़ तथा इसी तरह की तकनीकों का उपयोग करता है। आप अपने ब्राउज़र की सेटिंग से कुकीज़ नियंत्रित कर सकते हैं।',
        },
        {
          heading: '7. आपके अधिकार',
          body: 'अपने निजी डेटा को देखने, सुधारने या हटाने का अधिकार आपको है। इन अधिकारों के लिए hello@ambedkargpt.in पर हमसे संपर्क करें। सत्यापित अनुरोधों का उत्तर हम 30 दिनों के भीतर देंगे।',
        },
        {
          heading: '8. नीति में बदलाव',
          body: 'हम इस गोपनीयता नीति को समय-समय पर अद्यतन कर सकते हैं। किसी महत्वपूर्ण बदलाव की सूचना हम आपको ईमेल से या मंच पर स्पष्ट सूचना के ज़रिए देंगे।',
        },
      ],
    },
  },
};

export default function LegalModal({ type, onClose }) {
  const { t, lang } = useI18n();
  // Anything other than Hindi falls back to English, which is also the right
  // answer for a language added to the picker before its policy is written.
  const content = (CONTENT[lang] ?? CONTENT.en)[type] ?? CONTENT.en[type];

  // Close on Escape key
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  if (!content) return null;

  // Into document.body: the footer renders inside PageTransition, whose
  // transform becomes the containing block for position:fixed and strands the
  // panel outside the viewport. Signup got away without this only because it
  // has no such ancestor.
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(3,6,17,0.82)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex w-full max-w-[640px] flex-col rounded-2xl border border-[#1e3260] bg-[#080e24] shadow-[0_32px_80px_rgba(0,0,0,0.7)]"
        style={{ maxHeight: '82vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1a2c55] px-6 py-4">
          <h2 className="font-display text-[20px] font-semibold text-white">
            {content.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#1e3260] text-[#8b94b8] transition hover:border-[#3a6bc4] hover:text-white"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-5 space-y-5">
          <p className="text-[12px] text-[#6b80ab]">{content.updated}</p>
          {content.sections.map((s) => (
            <div key={s.heading}>
              <h3 className="mb-1.5 text-[13px] font-semibold text-[#9dc3ff]">{s.heading}</h3>
              <p className="text-[13px] leading-relaxed text-[#a6b9d6]">{s.body}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-[#1a2c55] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-gradient-to-r from-[#0a7dff] to-[#3a9fff] py-2.5 text-[14px] font-semibold text-white transition hover:brightness-110"
          >
            {t('legal.understand')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
