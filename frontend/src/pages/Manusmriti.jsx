import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import SectionHeading from '../components/ui/SectionHeading';
import Spinner from '../components/Spinner';
import PostCard from '../components/manusmriti/PostCard';
import { fetchManusmriti } from '../api/manusmriti';
import { ALL, postsForTopic, topicFromQuery } from '../data/manusmriti';
import { useI18n } from '../i18n/index.jsx';

/**
 * The Manusmriti section (a trial): short posts that criticise what the text itself says.
 *
 * It is a page to read, not a bot to ask. There is no text box and nothing is sent anywhere: the posts were
 * written and checked against the verses beforehand, and the visitor only chooses which topic to read. The
 * chosen topic lives in the address (?topic=...), so a topic can be linked to.
 *
 * The grid is items-start on purpose: a card that opens its verses grows on its own, instead of stretching
 * its neighbour in the row into a tall empty box.
 */

const chip = (active) =>
  `shrink-0 rounded-full border px-4 py-2 text-[14px] font-medium transition ${
    active
      ? 'border-[#3f6bd4]/70 bg-[#0d1a3a] text-[#3f9fff] shadow-[0_0_12px_rgba(63,159,255,0.18)]'
      : 'border-white/10 text-white/70 hover:border-[#3f9fff]/40 hover:text-[#3f9fff]'
  }`;

export default function Manusmriti() {
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState({ status: 'loading', data: null });
  const [attempt, setAttempt] = useState(0);

  // State is set only when the answer arrives (and not at all if the page has gone), and the retry button
  // resets it in its own handler, so the effect never sets state while it runs.
  useEffect(() => {
    let alive = true;
    fetchManusmriti()
      .then((data) => { if (alive) setState({ status: 'ready', data }); })
      .catch(() => { if (alive) setState({ status: 'error', data: null }); });
    return () => { alive = false; };
  }, [attempt]);
  const load = useCallback(() => {
    setState({ status: 'loading', data: null });
    setAttempt((n) => n + 1);
  }, []);

  const data = state.data;
  const topics = useMemo(() => data?.topics ?? [], [data]);
  const topic = topicFromQuery(params.get('topic'), topics);
  const shown = useMemo(() => postsForTopic(data?.posts ?? [], topic), [data, topic]);
  const titleOf = useMemo(() => {
    const byId = Object.fromEntries(topics.map((x) => [x.id, lang === 'hi' ? x.title_hi : x.title]));
    return (id) => byId[id] ?? '';
  }, [topics, lang]);
  const current = topics.find((x) => x.id === topic);

  const choose = (id) => setParams(id === ALL ? {} : { topic: id }, { replace: true });

  return (
    <MainLayout>
      <section className="mx-auto w-full max-w-[1440px] px-6 py-16 md:px-[91px]">
        <SectionHeading eyebrow={t('msm.eyebrow')} title={t('msm.title')} description={t('msm.desc')} />

        {state.status === 'loading' && (
          <Spinner className="mt-16" size={36} label={t('msm.loading')} showLabel />
        )}

        {state.status === 'error' && (
          <div className="mt-12 rounded-2xl border border-white/10 bg-[#0a1020]/80 p-6" role="alert">
            <p className="text-[#d0d9ea]">{t('msm.error')}</p>
            <button
              type="button"
              onClick={load}
              className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-[#1e3260]/70 bg-[#0a1428]/80 px-4 text-[14.5px] font-semibold text-[#c7d6ee] transition hover:border-[#3a6bc4]/70 hover:text-white"
            >
              {t('msm.retry')}
            </button>
          </div>
        )}

        {state.status === 'ready' && (
          <>
            <nav aria-label={t('msm.topics')} className="-mx-6 mt-10 flex gap-2 overflow-x-auto px-6 pb-2 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
              <button type="button" onClick={() => choose(ALL)} aria-pressed={topic === ALL} className={chip(topic === ALL)}>
                {t('msm.all')} <span className="ml-1 text-white/45">{data.posts.length}</span>
              </button>
              {topics.map((x) => (
                <button key={x.id} type="button" onClick={() => choose(x.id)} aria-pressed={topic === x.id} className={chip(topic === x.id)}>
                  {lang === 'hi' ? x.title_hi : x.title} <span className="ml-1 text-white/45">{x.count}</span>
                </button>
              ))}
            </nav>

            {current && (
              <p className="mt-5 max-w-3xl text-[16px] leading-7 text-[#c7d5ee]">{lang === 'hi' ? current.blurb_hi : current.blurb}</p>
            )}

            {shown.length === 0 ? (
              <p className="mt-10 text-[#9fb2d6]">{t('msm.empty')}</p>
            ) : (
              <div className="mt-8 grid items-start gap-5 lg:grid-cols-2">
                {shown.map((post) => (
                  <PostCard key={post.id} post={post} topicTitle={titleOf(post.topic)} verses={data.verses} />
                ))}
              </div>
            )}

            <p className="mt-10 max-w-3xl text-[14px] leading-6 text-[#8aa4d6]">
              {t('msm.note')}
              {data.translation ? ` ${t('msm.translation', { name: data.translation })}` : ''}
            </p>
          </>
        )}
      </section>
    </MainLayout>
  );
}
