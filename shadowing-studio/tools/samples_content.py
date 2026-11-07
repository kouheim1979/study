# -*- coding: utf-8 -*-
"""Original sample lessons for Shadowing Studio.

All English passages, translations, notes and quizzes below were written
for this project and are released with the app (see ../LICENSE-SAMPLES.md).
Each sentence is a list of chunks: (english, japanese meaning, sound note).
"""

LESSONS = [
    {
        "id": "s01-morning-routine",
        "title": "My Morning Routine",
        "titleJa": "わたしの朝の習慣",
        "level": "A1",
        "theme": "日常",
        "description": "起きてから家を出るまでの朝の流れ。基本動詞と時刻表現を練習します。",
        "sentences": [
            {"ja": "私は毎朝6時半に起きます。", "chunks": [
                ("I get up", "私は起きる", "get up は t と u がつながり、t が弾音化して「ゲラップ」に近く聞こえます。"),
                ("at six thirty", "6時半に", "at の t は次の s の前でほとんど聞こえません（脱落）。"),
                ("every morning.", "毎朝", "every は「エヴリ」と2音節で。e にアクセント。"),
            ]},
            {"ja": "まず窓を開けて、水を1杯飲みます。", "chunks": [
                ("First,", "まず", "語末の st は母音を入れずに「ファースト」ではなく「ファ～スt」。"),
                ("I open the window", "窓を開ける", "open the：n の舌の位置のまま th に移ります。"),
                ("and drink a glass of water.", "そして水を1杯飲む", "and は弱く「ン」程度。drink a →「ドリンカ」、glass of →「グラサヴ」、water の t は弾音で「ワーラー」に近い。"),
            ]},
            {"ja": "それからトーストを焼いて、スマホでニュースを確認します。", "chunks": [
                ("Then I make some toast", "それからトーストを作る", "make some：k を軽く止めて s へ。some は弱く短く。"),
                ("and check the news", "ニュースを確認する", "check the：k のあとすぐ th へ。the は弱く「ザ」。"),
                ("on my phone.", "スマホで", "on my：n と m が続くので口を閉じる準備を早めに。"),
            ]},
            {"ja": "8時15分前（7時45分）に家を出ます。", "chunks": [
                ("I leave home", "家を出る", "leave は長い「リーヴ」。live（リヴ）と区別。"),
                ("at a quarter to eight.", "8時15分前に", "at a →「アラ」（t の弾音化）。to は弱形で「タ」。"),
            ]},
            {"ja": "シンプルな習慣ですが、1日をうまく始めるのに役立っています。", "chunks": [
                ("It's a simple routine,", "シンプルな習慣だが", "It's a →「イツァ」とつながります。routine は後ろの「ティーン」を強く。"),
                ("but it helps me", "それは私の助けになる", "but it →「バリッ」。t の弾音化と語末 t の脱落。"),
                ("start the day well.", "1日をうまく始めるのに", "start the：語末の t はほぼ飲み込まれて th へ。"),
            ]},
        ],
        "words": [
            ("routine", "/ruːˈtiːn/", "名", "日課、決まった手順", "後半の「ティーン」に強勢。"),
            ("glass", "/ɡlæs/", "名", "コップ、グラス1杯", "a は「ア」と「エ」の中間の口で。"),
            ("toast", "/toʊst/", "名", "トースト", "「トウスト」と二重母音で。"),
            ("check", "/tʃek/", "動", "確認する", "語末の k は息だけ軽く。"),
            ("leave", "/liːv/", "動", "出発する、去る", "長母音。live /lɪv/ と区別。"),
            ("quarter", "/ˈkwɔːrtər/", "名", "4分の1、15分", "t は弾音化して「クウォーラー」に近く聞こえることも。"),
        ],
        "quiz": [
            ("話し手は何時に起きますか。", ["6時", "6時半", "7時45分"], 1),
            ("話し手が最初にすることは何ですか。", ["窓を開けて水を飲む", "トーストを作る", "ニュースを確認する"], 0),
            ("話し手は何時に家を出ますか。", ["7時15分", "7時45分", "8時15分"], 1),
        ],
    },
    {
        "id": "s02-kyoto-weekend",
        "title": "A Weekend in Kyoto",
        "titleJa": "京都で過ごした週末",
        "level": "A2",
        "theme": "旅行",
        "description": "過去形で旅行の思い出を語ります。to の弱形や語末 t の変化が多く出てきます。",
        "sentences": [
            {"ja": "先週末、妹と電車で京都へ行きました。", "chunks": [
                ("Last weekend,", "先週末", "Last の t は次の w の前で脱落しやすく「ラスウィークエン」。"),
                ("I took a train to Kyoto", "京都まで電車で行った", "took a →「トゥカ」。to は弱く「タ」。"),
                ("with my sister.", "妹と", "with my：th を短く、すぐ m へ。"),
            ]},
            {"ja": "混雑する前に古いお寺をいくつか訪れたかったのです。", "chunks": [
                ("We wanted to visit", "訪れたかった", "wanted to →「ウォンティッタ」。nt の t が弱まり「ウォニッタ」にも。"),
                ("some old temples", "古いお寺をいくつか", "some old →「サモウルド」。m と o がつながります。"),
                ("before it got crowded.", "混雑する前に", "it got：語末 t は破裂させず止めるだけ。"),
            ]},
            {"ja": "そこで早起きして、8時に最初のお寺に着きました。", "chunks": [
                ("So we got up early", "それで早起きした", "got up →「ガラップ」。up early もつながって「アッパーリー」。"),
                ("and arrived at the first temple", "最初のお寺に到着した", "arrived at →「アライヴダッ」。d と a がつながります。"),
                ("at eight.", "8時に", "at eight →「アレイ(ト)」。"),
            ]},
            {"ja": "静かで、朝の空気がとても新鮮に感じられました。", "chunks": [
                ("It was quiet,", "静かだった", "It was →「イッワズ」。was は弱形。quiet は「クワイエット」の2音節。"),
                ("and the morning air", "そして朝の空気は", "morning air →「モーニンゲア」。"),
                ("felt really fresh.", "とても新鮮に感じた", "felt の t は次の r の前で弱まります。"),
            ]},
            {"ja": "午後は小さなお店で抹茶のお菓子を食べてみました。", "chunks": [
                ("In the afternoon,", "午後は", "In the：n と th は舌の位置が近いのでなめらかに。"),
                ("we tried green tea sweets", "抹茶のお菓子を試した", "tried green：d を止めてすぐ gr へ。"),
                ("at a small shop.", "小さなお店で", "at a →「アラ」。"),
            ]},
            {"ja": "短い旅行でしたが、秋にまた行きたいです。", "chunks": [
                ("It was a short trip,", "短い旅行だったが", "was a →「ワザ」。"),
                ("but I want to go back", "また行きたい", "but I →「バライ」。want to →「ワナ」に近く聞こえます。"),
                ("in autumn.", "秋に", "autumn の最後の n は発音しません（黙字）。"),
            ]},
        ],
        "words": [
            ("weekend", "/ˈwiːkend/", "名", "週末", "前の「ウィーク」に強勢。"),
            ("temple", "/ˈtempəl/", "名", "寺", "語末は「ポー」ではなく暗い L で軽く。"),
            ("crowded", "/ˈkraʊdɪd/", "形", "混雑した", "「クラウディッド」。ow は「アウ」。"),
            ("arrive", "/əˈraɪv/", "動", "到着する", "後ろの「ライヴ」に強勢。"),
            ("quiet", "/ˈkwaɪət/", "形", "静かな", "2音節。quite（クワイト）と区別。"),
            ("fresh", "/freʃ/", "形", "新鮮な", "sh は唇を少し突き出して。"),
            ("autumn", "/ˈɔːtəm/", "名", "秋", "最後の n は読まない。"),
        ],
        "quiz": [
            ("話し手は誰と京都へ行きましたか。", ["友だち", "妹", "母"], 1),
            ("なぜ早起きしたのですか。", ["混む前にお寺を訪れるため", "電車に乗り遅れないため", "お菓子を買うため"], 0),
            ("話し手はいつまた行きたいと言っていますか。", ["春", "夏", "秋"], 2),
        ],
    },
    {
        "id": "s03-working-from-home",
        "title": "Working from Home",
        "titleJa": "在宅勤務のメリットと課題",
        "level": "B1",
        "theme": "仕事",
        "description": "在宅勤務の良い点と難しい点を比べる説明文。論理をつなぐ表現と弱形を練習します。",
        "sentences": [
            {"ja": "最近では、多くの人が少なくとも週に数日は在宅で働いています。", "chunks": [
                ("These days,", "最近では", "These の th は舌先を軽く歯に当てて濁らせます。"),
                ("a lot of people work from home", "多くの人が在宅で働く", "a lot of →「アラロヴ」。t の弾音化と of の弱形。"),
                ("at least a few days a week.", "少なくとも週に数日", "least a →「リースタ」。days a →「デイザ」。"),
            ]},
            {"ja": "通勤しなくてよいので時間の節約になります。", "chunks": [
                ("It saves time", "時間の節約になる", "saves time：z を短くしてすぐ t へ。"),
                ("because you don't have to commute.", "通勤しなくていいので", "don't の t は脱落しがち。have to →「ハフタ」。commute は後ろに強勢。"),
            ]},
            {"ja": "また、忙しいオフィスの騒音がないので集中しやすくなります。", "chunks": [
                ("You can also focus better", "より集中することもできる", "can は弱形で「クン」。better の tt は弾音で「ベラー」。"),
                ("without the noise", "騒音なしで", "without the：t は止めるだけで th へ。"),
                ("of a busy office.", "忙しいオフィスの", "of a →「オヴァ」。"),
            ]},
            {"ja": "一方で、孤独を感じたり、仕事をやめにくいと感じたりする人もいます。", "chunks": [
                ("On the other hand,", "一方で", "On the other →「オンジアザー」。hand の d は弱まります。"),
                ("some people feel lonely", "孤独を感じる人もいる", "feel lonely：L が2回続くので一度でつなげます。"),
                ("and find it hard", "そして難しいと感じる", "find it →「ファインディッ」。"),
                ("to stop working.", "仕事をやめるのが", "stop working：p は破裂させず口を閉じるだけ。"),
            ]},
            {"ja": "だからこそ、いつ始めていつ終えるかなど、はっきりしたルールを決めることが大切です。", "chunks": [
                ("That's why it's important", "だからこそ大切だ", "why it's →「ワイイッツ」。it's important は s と i をつなげて。"),
                ("to set clear rules,", "明確なルールを決めることが", "set clear：t を止めて cl へ。"),
                ("like when to start and finish.", "いつ始めて終えるかなど", "start and →「スターラン(ド)」。and は弱形。"),
            ]},
            {"ja": "適切なバランスがあれば、在宅勤務は生産的で快適なものになります。", "chunks": [
                ("With the right balance,", "適切なバランスがあれば", "right balance：t を止めて b へ。"),
                ("working from home can be", "在宅勤務は〜になりうる", "can be：can は弱く短く。"),
                ("both productive and comfortable.", "生産的で快適な", "productive and →「プロダクティヴァン」。comfortable は「カンフタブル」の3音節。"),
            ]},
        ],
        "words": [
            ("commute", "/kəˈmjuːt/", "動", "通勤する", "後ろの「ミュート」に強勢。"),
            ("focus", "/ˈfoʊkəs/", "動", "集中する", "「フォウカス」。"),
            ("noise", "/nɔɪz/", "名", "騒音", "語末は濁った z。"),
            ("lonely", "/ˈloʊnli/", "形", "孤独な、寂しい", "L で始まる。only と同じリズム。"),
            ("important", "/ɪmˈpɔːrtənt/", "形", "大切な", "tant の t は声門閉鎖で「インポーッンt」とも。"),
            ("productive", "/prəˈdʌktɪv/", "形", "生産的な", "「ダク」に強勢。"),
            ("comfortable", "/ˈkʌmftəbəl/", "形", "快適な", "3音節「カンフタブル」。or は発音しないことが多い。"),
        ],
        "quiz": [
            ("在宅勤務で時間が節約できる理由は何ですか。", ["通勤しなくてよいから", "会議が短いから", "メールが少ないから"], 0),
            ("在宅勤務で困ることとして挙げられているのは何ですか。", ["孤独を感じ、仕事をやめにくいこと", "インターネットが遅いこと", "家がうるさいこと"], 0),
            ("話し手がすすめていることは何ですか。", ["毎日オフィスに行く", "はっきりしたルールを決める", "長く働く"], 1),
        ],
    },
    {
        "id": "s04-daily-walk",
        "title": "A Short Walk Every Day",
        "titleJa": "毎日少し歩く",
        "level": "A2",
        "theme": "健康",
        "description": "散歩を習慣にした体験談。黙字（walk の l、listen の t）や前置詞のつながりを練習します。",
        "sentences": [
            {"ja": "医者に1日30分歩くように言われました。", "chunks": [
                ("My doctor told me", "医者に言われた", "told me：d を止めてすぐ m へ。"),
                ("to walk for thirty minutes a day.", "1日30分歩くように", "walk の l は発音しません。minutes a →「ミニッツァ」。"),
            ]},
            {"ja": "最初は退屈だろうと思っていました。", "chunks": [
                ("At first,", "最初は", "At first：t は止めるだけ。"),
                ("I thought it would be boring.", "退屈だろうと思った", "thought it →「ソーリッ」。would は弱形「ウド」。"),
            ]},
            {"ja": "でも今では、特に夕方の散歩を本当に楽しんでいます。", "chunks": [
                ("But now I really enjoy it,", "今では本当に楽しんでいる", "enjoy it →「エンジョイイッ」。y の音でつながります。"),
                ("especially in the evening.", "特に夕方に", "especially in →「イスペシャリーイン」。"),
            ]},
            {"ja": "ポッドキャストを聞いたり、木や空を眺めたりします。", "chunks": [
                ("I listen to podcasts", "ポッドキャストを聞く", "listen の t は黙字。"),
                ("and look at the trees", "そして木を見る", "look at the →「ルッカッザ」。"),
                ("and the sky.", "そして空を", "and the：d を落として「アンザ」。"),
            ]},
            {"ja": "数週間後、よく眠れるようになり、疲れにくくなりました。", "chunks": [
                ("After a few weeks,", "数週間後", "After a →「アフタラ」。"),
                ("I started sleeping better", "よく眠れるようになった", "started の ed は「ティッド」。better は「ベラー」。"),
                ("and feeling less tired.", "そして疲れにくくなった", "less tired：s から t へなめらかに。"),
            ]},
            {"ja": "歩くことは簡単で、お金もかからず、体にも心にも良いのです。", "chunks": [
                ("Walking is easy, free,", "歩くことは簡単で無料", "Walking is →「ウォーキンギズ」。"),
                ("and good for both body and mind.", "体にも心にも良い", "good for：d を止めて f へ。body and →「バディアン」。"),
            ]},
        ],
        "words": [
            ("doctor", "/ˈdɑːktər/", "名", "医者", "「ダクター」。o は口を大きく。"),
            ("minute", "/ˈmɪnɪt/", "名", "分", "「ミニット」。語末 t は弱く。"),
            ("boring", "/ˈbɔːrɪŋ/", "形", "退屈な", "「ボーリング」の最後は鼻に抜ける ng。"),
            ("especially", "/ɪˈspeʃəli/", "副", "特に", "「スペ」に強勢。"),
            ("listen", "/ˈlɪsən/", "動", "聞く", "t は読まない。"),
            ("tired", "/ˈtaɪərd/", "形", "疲れた", "1音節に近く「タイアド」。"),
            ("mind", "/maɪnd/", "名", "心、精神", "「マインド」。d は軽く。"),
        ],
        "quiz": [
            ("医者は1日にどれくらい歩くように言いましたか。", ["10分", "30分", "1時間"], 1),
            ("話し手は最初、散歩をどう思っていましたか。", ["退屈そう", "大変そう", "お金がかかりそう"], 0),
            ("数週間後に何が変わりましたか。", ["忙しくなった", "よく眠れて疲れにくくなった", "体重が増えた"], 1),
        ],
    },
]
