var fs          = require('fs');
var safe        = require('safe-regex');
var assert      = require('assert');
var requirejs   = require('requirejs');
var parseJS     = require('@babel/parser').parse;
var traverse    = require('@babel/traverse').default;
var {UAParser}  = require('../../src/main/ua-parser');
var browsers    = require('../data/ua/browser/browser-all.json');
var cpus        = require('../data/ua/cpu/cpu-all.json');
var devices     = readJsonFiles('test/data/ua/device');
var engines     = require('../data/ua/engine/engine-all.json');
var os          = readJsonFiles('test/data/ua/os');
var { Headers } = require('node-fetch');

function readJsonFiles(dir) {
    var list = [];
    fs.readdirSync(dir).forEach(function (file) {
        list.push(...JSON.parse(fs.readFileSync(`${dir}/${file}`, 'utf-8')));
    });
    return list;
};

describe('UAParser()', function () {
    var ua = 'Mozilla/5.0 (Windows NT 6.2) AppleWebKit/536.6 (KHTML, like Gecko) Chrome/20.0.1090.0 Safari/536.6';
    assert.deepEqual(UAParser(ua), new UAParser().setUA(ua).getResult());
});

describe('UAParser() constructor does not throw with undefined ua argument', function () {
    assert.doesNotThrow(() => new UAParser(undefined).getResult());
});

describe('UAParser.setUA method does not throw with undefined ua argument', function () {
    assert.doesNotThrow(() => new UAParser().setUA(undefined).getResult());
});

describe('UAParser get*() methods', () => {
    [
        {
            title       : 'getBrowser()',
            label       : 'browser',
            list        : browsers
        },
        {
            title       : 'getCPU()',
            label       : 'cpu',
            list        : cpus
        },
        {
            title       : 'getDevice()',
            label       : 'device',
            list        : devices
        },
        {
            title       : 'getEngine()',
            label       : 'engine',
            list        : engines
        },
        {
            title       : 'getOS()',
            label       : 'os',
            list        : os
        }
    ]
    .forEach(method => {
        describe(`[${method.title}]`, () => {
            method.list.forEach(unit => {
                describe(`[${unit.desc}]: "${unit.ua}"`, () => {
                    const actual = UAParser(unit.ua)[method.label];
                    Object.entries(unit.expect).forEach(entry => {
                        const [key, val] = entry;
                        it(`Should return ${key}: ${val}`, () => {
                            assert.strictEqual(String(val), String(actual[key]));
                        });
                    });
                });
            });
        });
    });
});

describe('Returns', function () {
    it('getResult() should returns JSON', function(done) {
        assert.deepEqual(new UAParser('').getResult(), 
            {
                ua : '',
                browser: { name: undefined, version: undefined, major: undefined, type: undefined },
                cpu: { architecture: undefined },
                device: { vendor: undefined, model: undefined, type: undefined },
                engine: { name: undefined, version: undefined},
                os: { name: undefined, version: undefined }
        });
        done();
    });

    it('works even when Array.prototype has been mangled', function(done) {
        const result = withMangledArrayProto(() => new UAParser('').getResult());

        function withMangledArrayProto(fn, key = 'isEmpty', value = function() { return this.length === 0; }) {
            const originalValue = Array.prototype[key];
            const restore = Object.hasOwnProperty.call(Array.prototype, key)
                ? () => Array.prototype[key] = originalValue
                : () => delete Array.prototype[key];

            Array.prototype[key] = value;
            const result = fn();
            restore();

            return result;
        }

        assert.deepEqual(result,
            {
                ua : '',
                browser: { name: undefined, version: undefined, major: undefined, type: undefined },
                cpu: { architecture: undefined },
                device: { vendor: undefined, model: undefined, type: undefined },
                engine: { name: undefined, version: undefined},
                os: { name: undefined, version: undefined }
        });
        done();
    });
});

describe('Extending Regex', function () {
    var uaString = 'Mozilla/5.0 MyOwnBrowser/1.3';
    var myOwnBrowser = [[/(myownbrowser)\/((\d+)?[\w\.]+)/i], [UAParser.BROWSER.NAME, UAParser.BROWSER.VERSION, UAParser.BROWSER.MAJOR]];

    var parser1 = new UAParser(uaString, {browser: myOwnBrowser});
    assert.strictEqual(parser1.getBrowser().name, 'MyOwnBrowser');
    assert.strictEqual(parser1.getBrowser().version, '1.3');
    assert.strictEqual(parser1.getBrowser().major, '1');

    var parser2 = new UAParser({browser: myOwnBrowser});
    assert.strictEqual(parser2.getBrowser().name, undefined);
    parser2.setUA(uaString);
    assert.strictEqual(parser2.getBrowser().name, 'MyOwnBrowser');
    assert.strictEqual(parser1.getBrowser().version, '1.3');

    let myOwnListOfBrowsers = [
        [/(mybrowser)\/([\w\.]+)/i], [UAParser.BROWSER.NAME, UAParser.BROWSER.VERSION, ['type', 'bot']]
    ];
    let myParser = new UAParser({ browser: myOwnListOfBrowsers });
    let myUA = 'Mozilla/5.0 MyBrowser/1.3';
    assert.deepEqual(myParser.setUA(myUA).getBrowser(), {name: "MyBrowser", version: "1.3", major: "1", type : "bot"});
    assert.strictEqual(myParser.getBrowser().is('bot'), true);
    
    let myOwnListOfDevices = [
        [/(mytab) ([\w ]+)/i], [UAParser.DEVICE.VENDOR, UAParser.DEVICE.MODEL, [UAParser.DEVICE.TYPE, UAParser.DEVICE.TABLET]],
        [/(myphone)/i], [UAParser.DEVICE.VENDOR, [UAParser.DEVICE.TYPE, UAParser.DEVICE.MOBILE]]
    ];
    let myParser2 = new UAParser({
        browser: myOwnListOfBrowsers,
        device: myOwnListOfDevices
    });
    let myUA2 = 'Mozilla/5.0 MyTab 14 Pro Max';
    assert.deepEqual(myParser2.setUA(myUA2).getDevice(), {vendor: "MyTab", model: "14 Pro Max", type: "tablet"});

    let myParser3 = new UAParser([{ 
        browser: myOwnListOfBrowsers 
    }, { 
        device: myOwnListOfDevices 
    }]);
    assert.deepEqual(myParser3.setUA(myUA2).getDevice(), {vendor: "MyTab", model: "14 Pro Max", type: "tablet"});
});

describe('User-agent length', function () {
    var UA_MAX_LENGTH = 500;

    // Real data from https://stackoverflow.com/questions/654921/how-big-can-a-user-agent-string-get#answer-6595973
    var uaString = 'Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.0; Trident/4.0; (R1 1.6); SLCC1; .NET CLR 2.0.50727; InfoPath.2; OfficeLiveConnector.1.3; OfficeLivePatch.0.0; .NET CLR 3.5.30729; .NET CLR 3.0.30618; 66760635803; runtime 11.00294; 876906799603; 97880703; 669602703; 9778063903; 877905603; 89670803; 96690803; 8878091903; 7879040603; 999608065603; 799808803; 6666059903; 669602102803; 888809342903; 696901603; 788907703; 887806555703; 97690214703; 66760903; 968909903; 796802422703; 8868026703; 889803611803; 898706903; 977806408603; 976900799903; 9897086903; 88780803; 798802301603; 9966008603; 66760703; 97890452603; 9789064803; 96990759803; 99960107703; 8868087903; 889801155603; 78890703; 8898070603; 89970603; 89970539603; 89970488703; 8789007603; 87890903; 877904603; 9887077703; 798804903; 97890264603; 967901703; 87890703; 97690420803; 79980706603; 9867086703; 996602846703; 87690803; 6989010903; 977809603; 666601903; 876905337803; 89670603; 89970200903; 786903603; 696901911703; 788905703; 896709803; 96890703; 998601903; 88980703; 666604769703; 978806603; 7988020803; 996608803; 788903297903; 98770043603; 899708803; 66960371603; 9669088903; 69990703; 99660519903; 97780603; 888801803; 9867071703; 79780803; 9779087603; 899708603; 66960456803; 898706824603; 78890299903; 99660703; 9768079803; 977901591603; 89670605603; 787903608603; 998607934903; 799808573903; 878909603; 979808146703; 9996088603; 797803154903; 69790603; 99660565603; 7869028603; 896707703; 97980965603; 976907191703; 88680703; 888809803; 69690903; 889805523703; 899707703; 997605035603; 89970029803; 9699094903; 877906803; 899707002703; 786905857603; 69890803; 97980051903; 997603978803; 9897097903; 66960141703; 7968077603; 977804603; 88980603; 989700803; 999607887803; 78690772803; 96990560903; 98970961603; 9996032903; 9699098703; 69890655603; 978903803; 698905066803; 977806903; 9789061703; 967903747703; 976900550903; 88980934703; 8878075803; 8977028703; 97980903; 9769006603; 786900803; 98770682703; 78790903; 878906967903; 87690399603; 99860976703; 796805703; 87990603; 968906803; 967904724603; 999606603; 988705903; 989702842603; 96790603; 99760703; 88980166703; 9799038903; 98670903; 697905248603; 7968043603; 66860703; 66860127903; 9779048903; 89670123903; 78890397703; 97890603; 87890803; 8789030603; 69990603; 88880763703; 9769000603; 96990203903; 978900405903; 7869022803; 699905422903; 97890703; 87990903; 878908703; 7998093903; 898702507603; 97780637603; 966907903; 896702603; 9769004803; 7869007903; 99660158803; 7899099603; 8977055803; 99660603; 7889080903; 66660981603; 997604603; 6969089803; 899701903; 9769072703; 666603903; 99860803; 997608803; 69790903; 88680756703; 979805677903; 9986047703; 89970803; 66660603; 96690903; 8997051603; 789901209803; 8977098903; 968900326803; 87790703; 98770024803; 697901794603; 69990803; 887805925803; 968908903; 97880603; 897709148703; 877909476903; 66760197703; 977908603; 698902703; 988706504803; 977802026603; 88680964703; 8878068703; 987705107903; 978902878703; 8898069803; 9768031703; 79680803; 79980803; 669609328703; 89870238703; 99960593903; 969904218703; 78890603; 9788000703; 69690630903; 889800982903; 988709748803; 7968052803; 99960007803; 969900800803; 668604817603; 66960903; 78790734603; 8868007703; 79780034903; 8878085903; 976907603; 89670830803; 877900903; 969904889703; 7978033903; 8987043903; 99860703; 979805903; 667603803; 976805348603; 999604127603; 97790701603; 78990342903; 98770672903; 87990253903; 9877027703; 97790803; 877901895603; 8789076903; 896708595603; 997601903; 799806903; 97690603; 87790371703; 667605603; 99760303703; 97680283803; 788902750803; 787909803; 79780603; 79880866903; 9986050903; 87890543903; 979800803; 97690179703; 876901603; 699909903; 96990192603; 878904903; 877904734903; 796801446903; 977904803; 9887044803; 797805565603; 98870789703; 7869093903; 87790727703; 797801232803; 666604803; 9778071903; 9799086703; 6969000903; 89670903; 8799075903; 897708903; 88680903; 97980362603; 97980503903; 889803256703; 88980388703; 789909376803; 69690703; 6969025903; 89970309903; 96690703; 877901847803; 968901903; 96690603; 88680607603; 7889001703; 789904761803; 976807703; 976902903; 878907889703; 9897014903; 896707046603; 696909903; 666603998903; 969902703; 79680421803; 9769075603; 798800192703; 97990903; 9689024903; 668604803; 969908671903; 9996094703; 69990642703; 97890895903; 977805619903; 79980859903; 88980443803; 98970649603; 997602703; 888802169903; 699907803; 667602028803; 786903283903; 997607703; 969909803; 798809925903; 9976045603; 97790903; 9789001903; 966903603; 9789069603; 968906603; 6989091803; 896701603; 6979059803; 978803903; 997606362603; 88980803; 98970803; 88880921703; 8997065703; 899700703; 698908703; 797801027903; 7889050903; 87890603; 78690703; 99660069703; 97980309903; 976800603; 666606803; 898707703; 79880019803; 66960250803; 7978049803; 88780602603; 79680903; 88880792703; 96990903; 667608603; 87790730903; 98970903; 9699032903; 8987004803; 88880703; 89770046603; 978800803; 969908903; 9798022603; 696901903; 799803703; 989703703; 668605903; 79780903; 998601371703; 796803339703; 87890922603; 898708903; 9966061903; 66960891903; 96790903; 8779050803; 98870858803; 976909298603; 9887029903; 669608703; 979806903; 878903803; 99960703; 9789086703; 979801803; 66960008703; 979806830803; 99760212703; 786906603; 797807603; 789907297703; 96990703; 786901603; 796807766603; 896702651603; 789902585603; 66660925903; 9986085703; 66960302703; 69890703; 789900703; 89970903; 9679060703; 9789002903; 979908821603; 986708140803; 976809828703; 7988082803; 79680997903; 99960803; 9788081903; 979805703; 787908603; 66960602803; 9887098703; 978803237703; 888806804603; 999604703; 977904703; 966904635703; 97680291703; 977809345603; 8878046703; 988709803; 976900773603; 989703903; 88780198603; 87790603; 986708703; 78890604703; 87790544803; 976809850903; 887806703; 987707527603; 79880803; 9897059603; 897709820603; 97880804803; 66960026703; 9789062803; 9867090803; 669600603; 8967087703; 78890903; 89770903; 97980703; 976802687603; 66860400803; 979901288603; 96990160903; 99860228903; 966900703; 66760603; 9689035703; 9779064703; 7968023603; 87890791903; 98770870603; 9798005803; 6969087903; 9779097903; 6979065703; 699903252603; 79780989703; 87690901803; 978905763903; 977809703; 97790369703; 899703269603; 8878012703; 78790803; 87690395603; 8888042803; 667607689903; 8977041803; 6666085603; 6999080703; 69990797803; 88680721603; 99660519803; 889807603; 87890146703; 699906325903; 89770603; 669608615903; 9779028803; 88880603; 97790703; 79780703; 97680355603; 6696024803; 78790784703; 97880329903; 9699077703; 89870803; 79680227903; 976905852703; 8997098903; 896704796703; 66860598803; 9897036703; 66960703; 9699094703; 9699008703; 97780485903; 999603179903; 89770834803; 96790445603; 79680460903; 9867009603; 89870328703; 799801035803; 989702903; 66960758903; 66860150803; 6686088603; 9877092803; 96990603; 99860603; 987703663603; 98870903; 699903325603; 87790803; 97680703; 8868030703; 9799030803; 89870703; 97680803; 9669054803; 6979097603; 987708046603; 999608603; 878904803; 998607408903; 968903903; 696900703; 977907491703; 6686033803; 669601803; 99960290603; 887809169903; 979803703; 69890903; 699901447903; 8987064903; 799800603; 98770903; 8997068703; 967903603; 66760146803; 978805087903; 697908138603; 799801603; 88780964903; 989708339903; 8967048603; 88880981603; 789909703; 796806603; 977905977603; 989700603; 97780703; 9669062603; 88980714603; 897709545903; 988701916703; 667604694903; 786905664603; 877900803; 886805490903; 89970559903; 99960531803; 7998033903; 98770803; 78890418703; 669600872803; 996605216603; 78690962703; 667604903; 996600903; 999608903; 9699083803; 787901803; 97780707603; 787905312703; 977805803; 8977033703; 97890708703; 989705521903; 978800703; 698905703; 78890376903; 878907703; 999602903; 986705903; 668602719603; 979901803; 997606903; 66760393903; 987703603; 78790338903; 96890803; 97680596803; 666601603; 977902178803; 877902803; 78790038603; 8868075703; 99960060603)';

    it('greater than ' + UA_MAX_LENGTH + ' should be trimmed down', function () {
        assert.strictEqual(UAParser(uaString).ua.length, UA_MAX_LENGTH);
    });
});

describe('Using Require.js', function () {
    it('should loaded automatically', function(done) {
        requirejs.config({
            baseUrl : 'dist',
            paths   : {
                'ua-parser-js' : 'ua-parser.min'
            }
        });
        requirejs(['ua-parser-js'], function(ua) {
            var parser = new ua('Dillo/1.0');
            assert.deepStrictEqual(parser.getBrowser().name, 'Dillo');
            done();
        });
    });
});

describe('Testing regexes', function () {

    var regexes;

    before('Read main js file', function () {
        var code = fs.readFileSync('src/main/ua-parser.js', 'utf8').toString();
        var ast = parseJS(code, { sourceType: "script" });
        regexes = [];
        traverse(ast, {
            RegExpLiteral: (path) => {
                regexes.push(path.node.pattern);
            }
        });

        if (regexes.length === 0) {
            throw new Error("Regexes cannot be empty!");
        }
    });

    describe('Begin testing', function () {
        it('all regexes in main file', function () {
            describe('Test against `safe-regex` module', function () {
                regexes.forEach(function (regex) {
                    it(`Should pass \`safe-regex\`: ${regex}`, function () {
                        assert.strictEqual(safe(regex), true);
                    });
                });
            });
        });
    });
});


describe('is() utility method', function () {
    let uap = new UAParser('Mozilla/5.0 (Mobile; Windows Phone 8.1; Android 4.0; ARM; Trident/7.0; Touch; rv:11.0; IEMobile/11.0; NOKIA; Lumia 635) like iPhone OS 7_0_3 Mac OS X AppleWebKit/537 (KHTML, like Gecko) Mobile Safari/537');

    it('Should match full name', function () {
        assert.strictEqual(uap.getBrowser().name, "IEMobile");
        assert.strictEqual(uap.getBrowser().is("IEMobile"), true);
        assert.strictEqual(uap.getBrowser().is("IE"), false);
        assert.strictEqual(uap.getBrowser().is("11.0"), false);
    });

    it('Should ignore "Browser" suffix', function () {
        assert.strictEqual(uap.getBrowser().is("IEMobile Browser"), true);
    });

    it('Should ignore case', function () {
        assert.strictEqual(uap.getEngine().name, "Trident");
        assert.strictEqual(uap.getEngine().is("tRiDeNt"), true);
        assert.strictEqual(uap.getEngine().is("7.0"), false);
    });

    it('Should get exact name', function () {
        assert.strictEqual(uap.getOS().name, "Windows Phone");
        assert.strictEqual(uap.getOS().is("Windows Phone"), true);
        assert.strictEqual(uap.getOS().is("Windows Phone OS"), true);
        assert.strictEqual(uap.getOS().is("Windows Mobile"), false);
        assert.strictEqual(uap.getOS().is("Android"), false);
    });

    it('Should check all device properties', function () {
        assert.deepEqual(uap.getDevice(), {
            vendor : "Nokia", 
            model : "Lumia 635", 
            type : "mobile"
        });
        assert.strictEqual(uap.getDevice().is("Nokia"), true);
        assert.strictEqual(uap.getDevice().is("Lumia 635"), true);
        assert.strictEqual(uap.getDevice().is("mobile"), true);

        assert.strictEqual(uap.getResult().device.is("Nokia"), true);
    });

    it('Should get result after reassignment', function () {
        uap.setUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/28.0.1500.95 Safari/537.36");
        assert.strictEqual(uap.getOS().name, "macOS");
        assert.strictEqual(uap.getOS().is("Mac OS"), true);
        assert.strictEqual(uap.getOS().is("macOS"), true);
        assert.strictEqual(uap.getOS().is("mac OS"), true);
        
        assert.strictEqual(uap.getOS().is("M ac"), false);
        assert.strictEqual(uap.getOS().is("M      a c   "), false);
        assert.strictEqual(uap.getOS().is("Mac OS OS"), false);
        assert.strictEqual(uap.getOS().is("Mac OS X"), false);

        assert.strictEqual(uap.getBrowser().is("Chrome"), true);
        assert.strictEqual(uap.getEngine().is("Blink"), true);
    });

    it('Should refrain from "undefined" until all properties are checked', function () {
        assert.strictEqual(uap.getDevice().is("undefined"), false);
        assert.strictEqual(uap.getDevice().is("Apple"), true);

        uap.setUA("");
        assert.strictEqual(uap.getDevice().model, undefined);
        assert.strictEqual(uap.getDevice().is("undefined"), false);
        assert.strictEqual(uap.getDevice().is(undefined), true);
    });

    //it('Should accept arch equivalent name', function () {
    it('Should accept exact arch name', function () {
        uap.setUA("Mozilla/5.0 (X11; Ubuntu; Linux i686; rv:19.0) Gecko/20100101 Firefox/19.0");
        assert.strictEqual(uap.getCPU().architecture, "ia32");
        assert.strictEqual(uap.getCPU().is("ia32"), true);
        assert.strictEqual(uap.getCPU().is("x86"), false);

        uap.setUA("Opera/9.80 (X11; Linux x86_64; U; Linux Mint; en) Presto/2.2.15 Version/10.10");
        assert.strictEqual(uap.getCPU().architecture, "amd64");
        assert.strictEqual(uap.getCPU().is("amd64"), true);
        assert.strictEqual(uap.getCPU().is("x86-64"), false);
        assert.strictEqual(uap.getCPU().is("x64"), false);
    });
});

describe('toString() utility method', function () {
    it('Should return full name', function () {
        let uap = new UAParser('Mozilla/5.0 (Mobile; Windows Phone 8.1; Android 4.0; ARM; Trident/7.0; Touch; rv:11.0; IEMobile/11.0; NOKIA; Lumia 635) like iPhone OS 7_0_3 Mac OS X AppleWebKit/537 (KHTML, like Gecko) Mobile Safari/537');
        assert.strictEqual(uap.getBrowser().name, "IEMobile");
        assert.strictEqual(uap.getBrowser().version, "11.0");
        assert.strictEqual(uap.getBrowser().major, "11");
        assert.strictEqual(uap.getBrowser().toString(), "IEMobile 11.0");

        assert.strictEqual(uap.getCPU().architecture, "arm");
        assert.strictEqual(uap.getCPU().toString(), "arm");

        assert.strictEqual(uap.getDevice().vendor, "Nokia");
        assert.strictEqual(uap.getDevice().model, "Lumia 635");
        assert.strictEqual(uap.getDevice().type, "mobile");
        assert.strictEqual(uap.getDevice().toString(), "Nokia Lumia 635");

        assert.strictEqual(uap.getEngine().name, "Trident");
        assert.strictEqual(uap.getEngine().version, "7.0");
        assert.strictEqual(uap.getEngine().toString(), "Trident 7.0");

        assert.strictEqual(uap.getOS().name, "Windows Phone");
        assert.strictEqual(uap.getOS().version, "8.1");
        assert.strictEqual(uap.getOS().toString(), "Windows Phone 8.1");
    });
});

describe('Read user-agent data from req.headers', function () {
    const ua = 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.2; Win64; x64; Trident/6.0)';
    const ext = {
        engine : [
            [/(msie)/i], [[UAParser.ENGINE.NAME, 'Custom Browser 1']],
            [/(edge)/i], [[UAParser.ENGINE.NAME, 'Custom Browser 2']]
        ]
    };
    const req = { 
        headers : {
            'user-agent' : 'Mozilla/5.0 (Windows NT 6.4; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/36.0.1985.143 Safari/537.36 Edge/12.0'
        }
    };

    it('Can be called with UAParser(ua)', function () {    
        let engine = UAParser(ua).engine;
        assert.strictEqual(engine.name, "Trident");
    });

    it('Can be called with UAParser(ua, extensions)', function () {    
        let engine = UAParser(ua, ext).engine;
        assert.strictEqual(engine.name, "Custom Browser 1");
    });

    it('Can be called with UAParser(ua, extensions, headers)', function () {    
        let engine = UAParser(ua, ext, req.headers).engine;
        assert.strictEqual(engine.name, "Custom Browser 1");
    });

    it('Can be called with UAParser(ua, headers)', function () {    
        let engine = UAParser(ua, req.headers).engine;
        assert.strictEqual(engine.name, "Trident");
    });

    it('Can be called with UAParser(extensions, headers)', function () {    
        let engine = UAParser(ext, req.headers).engine;
        assert.strictEqual(engine.name, "Custom Browser 2");
    });

    it('Can be called with UAParser(headers)', function () {    
        let engine = UAParser(req.headers).engine;
        assert.strictEqual(engine.name, "EdgeHTML");
    });

    it('Fetch API\'s Header can be passed directly into headers', () => {
        const reqHeaders = new Headers();
        reqHeaders.append('User-Agent', 'Midori/0.2.2 (X11; Linux i686; U; en-us) WebKit/531.2+');
        const { browser } = UAParser(reqHeaders);
        assert.strictEqual(browser.is('Midori'), true);
    });
});
