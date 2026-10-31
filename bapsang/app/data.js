import {EXTRA_INGREDIENTS,INGREDIENT_UPDATES,ALLERGY_OPTIONS,createDislikeOptions} from './catalog.js';
export {ALLERGY_OPTIONS,ALLERGY_GROUPS,DISLIKE_GROUPS,optionMatches} from './catalog.js';
// Amounts and nutrition are illustrative recipe estimates, per person.
export const INGREDIENTS = {
 ...EXTRA_INGREDIENTS,
 rice:{name:'쌀',emoji:'🍚',unit:'g',pack:1000,price:4200,category:'곡물·양념',allergens:[]},
 kimchi:{name:'배추김치',emoji:'🥬',unit:'g',pack:500,price:5900,category:'채소·과일',allergens:['fish','shellfish']},
 egg:{name:'달걀',emoji:'🥚',unit:'개',pack:10,price:3980,category:'육류·달걀',allergens:['egg']},
 tofu:{name:'두부',emoji:'◻️',unit:'g',pack:300,price:1800,category:'유제품·두부',allergens:['soy']},
 softtofu:{name:'순두부',emoji:'◻️',unit:'g',pack:350,price:1700,category:'유제품·두부',allergens:['soy']},
 pork:{name:'돼지고기 앞다리살',emoji:'🥩',unit:'g',pack:500,price:6500,category:'육류·달걀',allergens:[]},
 chicken:{name:'닭가슴살',emoji:'🍗',unit:'g',pack:500,price:6500,category:'육류·달걀',allergens:[]},
 beef:{name:'소고기 불고기용',emoji:'🥩',unit:'g',pack:300,price:9900,category:'육류·달걀',allergens:[]},
 tuna:{name:'참치캔',emoji:'🐟',unit:'g',pack:150,price:2500,category:'생선·해산물',allergens:['fish']},
 shrimp:{name:'냉동 새우',emoji:'🦐',unit:'g',pack:300,price:6900,category:'생선·해산물',allergens:['shellfish']},
 zucchini:{name:'애호박',emoji:'🥒',unit:'g',pack:300,price:1900,category:'채소·과일',allergens:[]},
 onion:{name:'양파',emoji:'🧅',unit:'g',pack:1000,price:2900,category:'채소·과일',allergens:[]},
 carrot:{name:'당근',emoji:'🥕',unit:'g',pack:500,price:1900,category:'채소·과일',allergens:[]},
 greenonion:{name:'대파',emoji:'🌱',unit:'g',pack:300,price:2500,category:'채소·과일',allergens:[]},
 mushroom:{name:'느타리버섯',emoji:'🍄',unit:'g',pack:200,price:1500,category:'채소·과일',allergens:[]},
 spinach:{name:'시금치',emoji:'🥬',unit:'g',pack:200,price:2900,category:'채소·과일',allergens:[]},
 potato:{name:'감자',emoji:'🥔',unit:'g',pack:1000,price:3900,category:'채소·과일',allergens:[]},
 sweetpotato:{name:'고구마',emoji:'🍠',unit:'g',pack:1000,price:5900,category:'채소·과일',allergens:[]},
 cucumber:{name:'오이',emoji:'🥒',unit:'g',pack:200,price:1200,category:'채소·과일',allergens:[]},
 cabbage:{name:'양배추',emoji:'🥬',unit:'g',pack:500,price:2200,category:'채소·과일',allergens:[]},
 garlic:{name:'다진 마늘',emoji:'🧄',unit:'g',pack:150,price:2500,category:'곡물·양념',allergens:[]},
 soy:{name:'진간장',emoji:'🫙',unit:'ml',pack:500,price:3900,category:'곡물·양념',allergens:['soy','wheat']},
 oil:{name:'식용유',emoji:'🫗',unit:'ml',pack:500,price:3900,category:'곡물·양념',allergens:[]},
 sesame:{name:'참기름',emoji:'🫙',unit:'ml',pack:160,price:5900,category:'곡물·양념',allergens:['sesame']},
 gochujang:{name:'고추장',emoji:'🌶️',unit:'g',pack:500,price:4900,category:'곡물·양념',allergens:['soy','wheat']},
 doenjang:{name:'된장',emoji:'🫙',unit:'g',pack:500,price:4500,category:'곡물·양념',allergens:['soy','wheat']},
 chili:{name:'고춧가루',emoji:'🌶️',unit:'g',pack:200,price:5900,category:'곡물·양념',allergens:[]},
 salt:{name:'소금',emoji:'🧂',unit:'g',pack:500,price:1900,category:'곡물·양념',allergens:[]},
 sugar:{name:'설탕',emoji:'🧂',unit:'g',pack:1000,price:2900,category:'곡물·양념',allergens:[]},
 noodle:{name:'소면',emoji:'🍜',unit:'g',pack:500,price:2500,category:'곡물·양념',allergens:['wheat']},
 oat:{name:'오트밀',emoji:'🥣',unit:'g',pack:500,price:4900,category:'곡물·양념',allergens:[]},
 milk:{name:'우유',emoji:'🥛',unit:'ml',pack:1000,price:2900,category:'유제품·두부',allergens:['milk']},
 yogurt:{name:'플레인 요거트',emoji:'🥛',unit:'g',pack:400,price:3500,category:'유제품·두부',allergens:['milk']},
 banana:{name:'바나나',emoji:'🍌',unit:'개',pack:5,price:2900,category:'채소·과일',allergens:[]},
 apple:{name:'사과',emoji:'🍎',unit:'개',pack:3,price:5900,category:'채소·과일',allergens:[]},
 bread:{name:'식빵',emoji:'🍞',unit:'장',pack:10,price:2900,category:'곡물·양념',allergens:['wheat','milk','egg']},
 peanut:{name:'땅콩버터',emoji:'🥜',unit:'g',pack:200,price:4900,category:'곡물·양념',allergens:['peanut']},
 seaweed:{name:'김',emoji:'🌿',unit:'장',pack:10,price:2900,category:'곡물·양념',allergens:[]}
};
for(const [id,update] of Object.entries(INGREDIENT_UPDATES))Object.assign(INGREDIENTS[id],update);
export const ALLERGENS=Object.fromEntries(ALLERGY_OPTIONS.map(x=>[x.id,x.label]));
export const DISLIKE_OPTIONS=createDislikeOptions(INGREDIENTS);
export const STORE_GROUPS=['종합 대형마트','창고형 할인점','SSM · 가성비','프레시 · 프리미엄','온라인 · 퀵커머스','편의점 · 동네 마트'];
const S=(id,name,mark,color,group)=>({id,name,mark,color,group});
export const STORES=[
 S('emart','이마트','e','#dcae28',0),S('homeplus','홈플러스','H','#ce4541',0),S('lotte','롯데마트','L','#c34241',0),S('megafood','메가푸드마켓','M','#b44443',0),
 S('costco','코스트코 코리아','C','#3f6693',1),S('traders','트레이더스','T','#7ba443',1),S('maxx','롯데마트 맥스','MAXX','#bd4146',1),
 S('gsfresh','GS더프레시','GS','#309f91',2),S('everyday','이마트에브리데이','e','#d6a52a',2),S('nobrand','노브랜드','N','#b49928',2),
 S('ssgfood','SSG푸드마켓','SSG','#50524f',3),S('orga','올가홀푸드','ORGA','#718841',3),S('kurly','마켓컬리','K','#692c83',3),
 S('coupang','쿠팡 로켓프레시','c','#39a9cf',4),S('ssg','SSG.COM','SSG','#c45554',4),S('bmart','배민 B마트','B','#4b9c97',4),
 S('cu','CU','CU','#7b488b',5),S('gs25','GS25','GS','#398d9c',5),S('seven','세븐일레븐','7','#298c72',5),S('emart24','이마트24','e24','#b38a35',5),S('market','동네 마트','M','#658958',5)
];
const R=(id,name,emoji,time,kcal,protein,ing,steps,extra={})=>({id,name,emoji,time,kcal,protein,carbs:Math.round((kcal-protein*4)*.65/4),fat:Math.round((kcal-protein*4)*.35/9),ing,steps,meals:['lunch','dinner'],tools:['stove'],tags:['한식'],...extra});
export const RECIPES=[
 R('kimchi-rice','달걀 톡, 김치볶음밥','🍳',15,535,19,{rice:85,kimchi:100,egg:1,greenonion:15,oil:8,soy:5,sesame:3},['쌀을 씻어 밥을 지어둡니다. 김치와 대파를 잘게 썰어요.','팬에 식용유와 대파를 넣고 중불에서 향을 낸 뒤, 김치를 넣어 3분 볶아요.','밥과 간장을 넣고 골고루 볶은 후 참기름을 둘러요.','달걀을 흰자와 노른자가 익을 때까지 부쳐 올리면 완성!'],{image:'kimchi',tags:['15분 완성','냉장고 털기'],note:'조리 시간은 지어둔 밥을 사용할 때 기준이에요.'}),
 R('softtofu','몽글몽글 순두부찌개','🍲',20,465,25,{rice:80,softtofu:175,egg:1,onion:40,greenonion:15,chili:5,garlic:5,soy:8,oil:5},['쌀밥을 준비하고 양파와 대파를 썰어요.','냄비에 기름, 대파, 마늘, 고춧가루를 넣고 약불에서 30초 볶아요. 타지 않게 조심하세요.','양파와 물 250ml, 간장을 넣고 5분 끓인 후 순두부를 넣어요.','달걀을 넣고 완전히 익을 때까지 4~5분 더 끓인 뒤 밥과 함께 드세요.'],{image:'tofu',tags:['든든한 집밥','고단백']}),
 R('bibimbap','알록달록 채소 비빔밥','🥗',25,548,17,{rice:85,carrot:40,zucchini:50,spinach:50,egg:1,gochujang:15,sesame:5,oil:5,salt:1},['밥을 짓고 당근과 애호박은 채 썰어요.','시금치는 끓는 물에 데쳐 찬물에 헹군 뒤 물기를 꼭 짜요.','당근과 애호박을 기름에 따로 볶고 소금으로 간해요. 달걀도 완전히 익혀요.','그릇에 밥과 채소, 달걀을 담고 고추장과 참기름을 곁들여요.'],{image:'table',tags:['채소 듬뿍','한 그릇']}),
 R('pork','매콤달콤 제육덮밥','🥩',20,642,32,{rice:85,pork:130,onion:60,cabbage:70,gochujang:15,soy:8,sugar:5,garlic:5,oil:5},['밥을 준비하고 고기와 채소를 한입 크기로 썰어요.','고추장, 간장, 설탕, 마늘에 고기를 5분 재워요.','팬에 식용유를 두르고 고기를 볶다가 채소를 넣어요.','돼지고기 중심 온도가 75℃ 이상에서 1분 유지되도록 충분히 익혀 밥 위에 올려요.'],{tags:['고단백','한 그릇']}),
 R('doenjang','구수한 두부 된장찌개','🍲',20,426,18,{rice:80,tofu:100,zucchini:60,onion:40,mushroom:40,doenjang:18,garlic:4},['쌀밥을 준비하고 두부와 채소를 먹기 좋게 썰어요.','냄비에 물 300ml를 끓이고 된장을 풀어요.','양파와 애호박, 버섯, 마늘을 넣고 5분 끓여요.','두부를 넣고 3분 더 끓인 뒤 따뜻한 밥과 함께 드세요.'],{tags:['든든한 집밥','채식']}),
 R('chicken-rice','담백한 닭가슴살 볶음밥','🍗',20,512,36,{rice:85,chicken:130,carrot:40,onion:40,greenonion:15,soy:10,oil:7},['밥을 준비하고 닭가슴살과 채소를 잘게 썰어요.','팬에 기름을 두르고 대파를 볶은 뒤 닭가슴살을 넣어요.','닭고기 중심 온도 75℃ 이상에서 1분 유지되도록 충분히 익혀요.','채소를 넣어 볶다가 밥과 간장을 넣고 골고루 볶아요.'],{tags:['고단백','한 그릇']}),
 R('tuna-rice','참치 채소 주먹밥','🍙',15,495,26,{rice:85,tuna:75,carrot:30,cucumber:40,seaweed:1,sesame:4,salt:1},['밥을 지어 한 김 식혀요. 참치는 기름이나 물을 빼요.','당근은 잘게 썰어 데치고, 오이도 잘게 썰어요.','밥에 참치, 채소, 참기름, 소금을 넣고 섞어요.','먹기 좋게 뭉친 뒤 잘게 부순 김을 입혀요. 바로 먹거나 냉장 보관하세요.'],{tools:['ricecooker'],tags:['도시락','고단백']}),
 R('tofu-rice','두부 버섯 간장덮밥','🍄',15,458,21,{rice:75,tofu:150,mushroom:70,onion:40,soy:10,garlic:5,oil:5},['밥을 준비하고 두부는 물기를 닦아 깍둑썰기해요.','팬에 기름을 두르고 두부를 노릇하게 구워요.','양파, 버섯, 마늘을 넣고 볶다가 간장과 물 3큰술을 더해요.','소스가 자작해지면 따뜻한 밥 위에 얹어요.'],{tags:['채식','15분 완성']}),
 R('egg-rice','대파 달걀볶음밥','🍳',10,498,19,{rice:85,egg:2,greenonion:20,carrot:30,oil:7,salt:1},['밥을 준비하고 대파와 당근을 잘게 썰어요.','기름을 두른 팬에 대파와 당근을 넣고 볶아요.','달걀을 넣고 완전히 익도록 스크램블해요.','밥과 소금을 넣어 고루 볶아 완성해요.'],{tags:['10분 완성','냉장고 털기']}),
 R('noodles','따뜻한 채소 잔치국수','🍜',20,420,15,{noodle:100,zucchini:50,carrot:30,egg:1,soy:12,greenonion:15,garlic:3},['물 400ml에 간장과 마늘을 넣고 끓여요.','애호박과 당근을 채 썰어 국물에 넣고 익혀요.','다른 냄비에서 소면을 포장지 시간대로 삶아 찬물에 헹궈요.','국수에 뜨거운 국물과 완전히 익힌 달걀을 올리고 대파를 더해요.'],{tags:['포근한 한 끼','한 그릇']}),
 R('cabbage','아삭아삭 양배추덮밥','🥬',15,445,12,{rice:80,cabbage:150,carrot:40,mushroom:50,oil:7,salt:1},['밥을 준비하고 양배추와 당근은 채 썰어요.','팬에 기름을 두르고 당근과 버섯을 먼저 볶아요.','양배추와 소금을 넣고 숨이 살짝 죽을 때까지 볶아요.','밥 위에 올려 담백하게 드세요.'],{tags:['채식','15분 완성']}),
 R('potato','포슬포슬 감자 채소죽','🥔',30,385,8,{rice:70,potato:100,carrot:30,zucchini:40,salt:1,sesame:3},['쌀을 씻어 20분 불려요. 감자와 채소는 잘게 썰어요.','냄비에 참기름을 넣고 불린 쌀과 감자를 2분 볶아요.','물 500ml를 넣고 저어가며 약불로 25분 끓여요.','채소를 넣어 5분 더 끓이고 소금으로 간해요.'],{meals:['breakfast','lunch','dinner'],tags:['채식','편안한 한 끼'],note:'표시 시간에 쌀 불리는 시간 20분은 포함하지 않았어요.'}),
 R('bulgogi','달큰한 소불고기덮밥','🥩',25,620,33,{rice:85,beef:120,onion:60,mushroom:50,soy:15,sugar:5,garlic:5,sesame:3},['밥을 준비하고 고기와 채소를 썰어요.','간장, 설탕, 마늘, 참기름을 섞어 고기에 버무려요.','팬에서 고기를 충분히 익힌 후 양파와 버섯을 넣어요.','채소가 익고 국물이 자작해지면 밥 위에 올려요.'],{tags:['고단백','가족 밥상']}),
 R('shrimp','탱글탱글 새우볶음밥','🦐',15,502,25,{rice:85,shrimp:100,egg:1,carrot:30,greenonion:15,oil:6,salt:1},['냉동 새우는 냉장 해동하고 물기를 닦아요. 밥을 준비해요.','팬에 기름을 두르고 대파와 당근을 볶아요.','새우를 넣어 속까지 불투명해지도록 완전히 익히고, 달걀도 넣어 익혀요.','밥과 소금을 넣고 골고루 볶아요.'],{tags:['15분 완성','고단백']}),
 R('chicken-soup','속 편한 닭가슴살 채소죽','🥣',25,425,32,{rice:70,chicken:120,carrot:30,zucchini:40,salt:1,sesame:3},['지어둔 밥을 준비하고 닭고기와 채소를 잘게 썰어요.','냄비에 참기름을 두르고 닭고기를 볶아요.','밥과 물 400ml를 넣고 약불에서 15분 저어가며 끓여요.','채소를 넣어 5분 더 끓이고 닭고기를 중심 온도 75℃ 이상으로 충분히 익혀 소금으로 간해요.'],{meals:['breakfast','lunch','dinner'],tags:['고단백','편안한 한 끼']}),
 R('steamed-egg','부드러운 달걀찜과 밥','🥚',12,435,20,{rice:75,egg:2,carrot:20,greenonion:10,salt:1},['밥을 준비해요. 전자레인지용 그릇에 달걀과 물 100ml, 소금을 넣고 풀어요.','다진 당근과 대파를 넣고 섞어요.','뚜껑을 살짝 열어 덮고 700W 전자레인지에서 3분 돌려요.','저어준 뒤 1분씩 추가 가열해 중앙까지 완전히 굳으면 밥과 함께 드세요.'],{tools:['microwave'],meals:['breakfast','lunch','dinner'],tags:['전자레인지','간편식']}),
 R('oat','바나나 밀크 오트밀','🥣',5,360,12,{oat:50,milk:180,banana:1},['큰 전자레인지용 그릇에 오트밀과 우유를 담아요.','700W 전자레인지에서 2분 가열하고 저어요.','넘치지 않게 확인하며 30초~1분 더 가열해요.','바나나를 썰어 올려요.'],{meals:['breakfast'],tools:['microwave'],tags:['5분 완성','간편식']}),
 R('toast','고소한 달걀 토스트','🍞',10,380,18,{bread:2,egg:1,cabbage:30,oil:5,salt:1},['양배추를 얇게 채 썰고 달걀, 소금과 섞어요.','팬에 기름을 두르고 달걀 반죽을 앞뒤로 완전히 익혀요.','같은 팬에서 식빵을 살짝 구워요.','식빵 사이에 달걀을 넣어 반으로 잘라요.'],{meals:['breakfast'],tags:['10분 완성','간편식']}),
 R('yogurt','사과 바나나 요거트볼','🍎',5,285,10,{yogurt:150,apple:0.5,banana:0.5,oat:20},['사과를 깨끗하게 씻고 바나나 껍질을 벗겨요.','과일을 한입 크기로 썰어요.','그릇에 요거트를 담고 과일과 오트밀을 올려요.'],{meals:['breakfast','snack'],tools:[],tags:['불 없이','상큼하게']}),
 R('sweetpotato','에어프라이어 군고구마','🍠',30,275,4,{sweetpotato:200,milk:150},['고구마를 깨끗이 씻고 물기를 닦아요.','작은 고구마를 에어프라이어에 겹치지 않게 넣어요.','180℃에서 25~30분 굽고 젓가락이 부드럽게 들어가면 꺼내요.','우유와 함께 곁들여요. 크기에 따라 가열 시간을 늘려주세요.'],{meals:['breakfast','snack'],tools:['airfryer'],tags:['간편식','든든한 간식']}),
 R('fruit','상큼한 사과·바나나 한 접시','🍌',5,180,2,{apple:0.5,banana:1},['사과를 깨끗이 씻고 씨를 제거해요.','바나나 껍질을 벗겨 한입 크기로 썰어요.','접시에 담아 바로 드세요.'],{meals:['breakfast','snack'],tools:[],tags:['채식','불 없이']}),
 R('peanut-toast','바나나 땅콩버터 토스트','🥜',5,340,11,{bread:2,peanut:20,banana:0.5},['식빵에 땅콩버터를 얇게 발라요.','바나나를 동그랗게 썰어 올려요.','취향에 따라 반으로 접어 드세요.'],{meals:['breakfast','snack'],tools:[],tags:['불 없이','간편식']}),
 R('cabbage-egg','양배추 달걀볶음','🍳',12,320,20,{egg:2,cabbage:120,oil:8,salt:1,greenonion:10},['양배추와 대파를 얇게 썰어요.','팬에 식용유를 두르고 대파, 양배추를 중불에서 볶아요.','달걀을 넣고 흰자와 노른자가 모두 익을 때까지 저어가며 볶아요.','소금으로 간하고 접시에 담아요.'],{meals:['breakfast','lunch','dinner'],carbs:10,fat:22,tags:['저탄수','한 팬 요리']}),
 R('tofu-salad','두부 오이 샐러드','🥗',10,310,24,{tofu:200,cucumber:100,sesame:5,salt:1},['바로 먹을 수 있는 샐러드용 두부를 준비해 물기를 닦아요.','오이를 깨끗하게 씻고 두부와 함께 깍둑썰기해요.','참기름과 소금을 섞어 드레싱을 만들어요.','두부와 오이에 드레싱을 가볍게 버무려 바로 드세요.'],{tools:[],carbs:10,fat:19,meals:['breakfast','lunch','dinner'],tags:['채식','불 없이']}),
 R('tuna-cucumber','참치 오이 보트','🥒',10,280,26,{tuna:100,cucumber:150,oil:5,salt:1},['오이를 깨끗이 씻고 길게 반으로 잘라 가운데 씨를 덜어내요.','참치캔의 물이나 기름을 따라내요.','참치에 식용 가능한 오일과 소금을 넣어 섞어요.','오이 위에 참치를 채워 바로 드세요.'],{tools:[],carbs:6,fat:17,meals:['breakfast','lunch','dinner','snack'],tags:['저탄수','불 없이']}),
 R('chicken-cabbage','닭가슴살 양배추볶음','🍗',20,370,38,{chicken:150,cabbage:150,garlic:5,oil:10,salt:1},['닭고기와 양배추를 먹기 좋게 썰어요.','팬에 기름과 마늘을 넣고 약불에서 볶아요.','닭고기를 넣고 중불로 볶다가 양배추를 더해요.','닭고기 중심 온도가 75℃ 이상에서 1분 유지되도록 익히고 소금으로 간해요.'],{carbs:11,fat:19,tags:['고단백','한 팬 요리']}),
 R('banana-smoothie','바나나 요거트 스무디','🥤',5,285,11,{banana:1,milk:150,yogurt:100},['바나나 껍질을 벗겨 작게 썰어요.','블렌더에 바나나, 우유, 요거트를 넣어요.','덩어리가 없어질 때까지 곱게 갈아 바로 드세요.'],{tools:['blender'],meals:['breakfast','snack'],tags:['블렌더','5분 완성']}),
 R('peanut-snack','고소한 땅콩버터 두부볼','🥜',5,260,17,{tofu:150,peanut:20},['바로 먹을 수 있는 샐러드용 두부를 준비해 물기를 닦아요.','두부를 포크로 곱게 으깨요.','땅콩버터를 골고루 섞어 작은 그릇에 담고 바로 드세요.'],{tools:[],meals:['breakfast','snack'],carbs:9,fat:17,tags:['저탄수','불 없이']}),
 R('kiwi-yogurt','키위 요거트볼','🥝',5,265,10,{kiwi:1,yogurt:150,oat:20},['키위 껍질을 벗겨 한입 크기로 썰어요.','그릇에 플레인 요거트를 담고 오트밀을 올려요.','키위를 얹어 바로 드세요.'],{tools:[],meals:['breakfast','snack'],tags:['과일 듬뿍','불 없이']}),
 R('peach-yogurt','복숭아 오트 요거트볼','🍑',5,275,11,{peach:1,yogurt:150,oat:25},['복숭아를 깨끗이 씻고 씨를 제거한 뒤 썰어요.','그릇에 요거트와 오트밀을 담아요.','복숭아를 올려 바로 드세요.'],{tools:[],meals:['breakfast','snack'],tags:['과일 듬뿍','불 없이']}),
 R('tomato-egg','토마토 달걀볶음밥','🍅',15,495,20,{rice:75,tomato:120,egg:2,greenonion:10,oil:6,salt:1},['밥을 준비하고 토마토와 대파를 먹기 좋게 썰어요.','팬에 기름을 두르고 달걀을 완전히 익도록 볶은 뒤 잠시 덜어둬요.','대파와 토마토를 볶고 밥과 달걀, 소금을 넣어요.','달걀이 속까지 충분히 익었는지 확인하고 골고루 볶아 드세요.'],{tags:['15분 완성','한 그릇']}),
 R('cilantro-chicken','고수 닭가슴살 샐러드','🌿',20,355,35,{chicken:140,cilantro:15,cucumber:80,tomato:80,oil:8,salt:1},['채소와 고수를 깨끗하게 씻어 물기를 빼고 먹기 좋게 썰어요.','팬에 기름을 두르고 닭가슴살을 구워요.','닭고기 중심 온도가 75℃ 이상에서 1분 유지되도록 익힌 뒤 한입 크기로 잘라요.','채소와 고수 위에 닭고기를 올리고 소금으로 간해 바로 드세요.'],{carbs:12,fat:17,tags:['고단백','향긋한 한 끼']})
];
export const MEALS={breakfast:'아침',lunch:'점심',dinner:'저녁',snack:'간식'};
export const TOOLS={microwave:'전자레인지',toaster:'토스터',blender:'블렌더',airfryer:'에어프라이어',stove:'가스·인덕션',slowcooker:'슬로쿠커',ricecooker:'전기밥솥',oven:'오븐'};
export const DEFAULT_PREFS={store:'emart',people:2,budget:90000,meals:['lunch','dinner'],tools:['stove','microwave','ricecooker'],style:'balanced',allergies:[]};
export const DEFAULT_PANTRY={rice:1000,kimchi:400,egg:6,soy:180,oil:200,salt:100,sesame:50,garlic:80,sugar:150,gochujang:100};
