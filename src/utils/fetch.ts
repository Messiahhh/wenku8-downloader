import axios from 'axios';
import cheerio from 'cheerio';
import iconv from 'iconv-lite';
import cookieParser from 'set-cookie-parser';

let Cookie =
    'PHPSESSID=7umkhbeoevf9hda5comi5556cuteebhe;PHPSESSID=55a3q02i0911e15th7s8ug1364c82lp2;jieqiUserInfo=jieqiUserId=312317,jieqiUserName=2497360927,jieqiUserGroup=3,jieqiUserVip=0,jieqiUserPassword=05a671c66aefea124cc08b76ea6d30bb,jieqiUserName_un=2497360927,jieqiUserHonor_un=&#x65B0;&#x624B;&#x4E0A;&#x8DEF;,jieqiUserGroupName_un=&#x666E;&#x901A;&#x4F1A;&#x5458;,jieqiUserLogin=1662190862;jieqiVisitInfo=jieqiUserLogin=1662190862,jieqiUserId=312317';

export async function fetch(url: string, encoding = 'gbk'): Promise<cheerio.Root> {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
            Cookie,
        },
    });
    return cheerio.load(iconv.decode(res.data, encoding), { decodeEntities: false });
}

export async function getCookie() {
    const res = await axios.post(
        `https://www.wenku8.net/login.php?do=submit&jumpurl=http%3A%2F%2Fwww.wenku8.net%2Findex.php`,
        `username=2497360927&password=testtest&usecookie=315360000&action=login&submit=%26%23160%3B%B5%C7%26%23160%3B%26%23160%3B%C2%BC%26%23160%3B`,
        {
            responseType: 'arraybuffer',
        }
    );

    const newCookie = cookieParser(res.headers['set-cookie']!)
        .map(({ name, value }) => `${name}=${value}`)
        .join(';');
    if (newCookie) {
        Cookie = newCookie;
    }
}
