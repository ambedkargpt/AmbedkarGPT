"""Near-duplicate stories: the same event written up more than once.

    group_duplicates(stories, threshold) -> list of groups (lists of indices)

Each story is compared on its source text (title, summary, the start of the
body) as a TF-IDF weighted bag of words; words every story shares (भाजपा,
कांग्रेस, ने, की) count for little, the names and specifics of one event for a
lot. Groups are joined transitively, so A~B and B~C put all three together.
"""
import math
import re
from collections import Counter

STOP = set("""का की के को में से पर और है हैं था थे थी ने भी तो यह ये वह वे इस उस एक कि
जो कर किया किए गया गई गए हो होगा होगी रहा रही रहे लिए साथ बाद तक अब कहा बताया""".split())


def _words(text):
    return [w for w in re.findall(r"[ऀ-ॿ\w]+", text.lower()) if len(w) > 1 and w not in STOP]


def _text(story):
    return " ".join([story.title or "", story.summary or "", (story.body or "")[:800]])


def similarity_matrix(stories):
    docs = [Counter(_words(_text(s))) for s in stories]
    df = Counter(w for d in docs for w in d)
    n = len(docs)
    vecs = []
    for d in docs:
        v = {w: c * math.log((1 + n) / (1 + df[w])) for w, c in d.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        vecs.append({w: x / norm for w, x in v.items()})
    sim = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            a, b = vecs[i], vecs[j]
            if len(a) > len(b):
                a, b = b, a
            s = sum(x * b.get(w, 0.0) for w, x in a.items())
            sim[i][j] = sim[j][i] = s
    return sim


def group_duplicates(stories, threshold):
    sim = similarity_matrix(stories)
    parent = list(range(len(stories)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i in range(len(stories)):
        for j in range(i + 1, len(stories)):
            if sim[i][j] >= threshold:
                parent[find(j)] = find(i)
    groups = {}
    for i in range(len(stories)):
        groups.setdefault(find(i), []).append(i)
    return [g for g in groups.values()], sim
