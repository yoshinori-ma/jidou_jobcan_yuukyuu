const puppeteer = require("puppeteer");
const readline = require("readline");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Tokyo");
const Holidays = require("date-holidays");
const { start } = require("repl");
const h = new Holidays("JP");
// 今日から来年5月末まで
// TODO: この辺は可変にする
const holidays = [...h.getHolidays(2021), ...h.getHolidays(2022)]
  .filter((holiday) => {
    const startDay = dayjs(holiday.start);
    return (
      startDay >= dayjs() &&
      startDay <= dayjs("2022-05-31") && // 今日から 5/31まで
      startDay.day() in [1, 2, 3, 4, 5] && // 土日だったらじょがい
      holiday.type === "public" // 国民の休日っぽいやつのみ
    );
  })
  .map((holiday) => {
    const day = dayjs(holiday.start);
    return [day.year(), day.month() + 1, day.date()];
  });

const headless = true;

const prompt = async (msg) => {
  console.log(msg);
  const answer = await question("> ");
  return answer.trim();
};

const question = (question) => {
  const readlineInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    readlineInterface.question(question, (answer) => {
      resolve(answer);
      readlineInterface.close();
    });
  });
};

// FIXME: この処理繰り返すとタイムアウトなりがち
// 適当にまたせたりtimeoutさせてるけど解消してるか不明
const sendHoliday = async (y, m, d, page) => {
  console.log(`${y}${m}${d}の申請をします`);
  await page.waitForTimeout(1000);
  // 休暇ページ
  await page.goto("https://ssl.jobcan.jp/employee/holiday/new");

  await page.select("#holiday_id", "1");
  await page.select("#holiday_year", y);
  await page.select("#holiday_month", m);
  await page.select("#holiday_day", d);
  await page.select("#to_holiday_year", y);
  await page.select("#to_holiday_month", m);
  await page.select("#to_holiday_day", d);

  await page.screenshot({ path: `histories/${y}${m}${d}_before_confirm.png` });
  await page.click('input[value="確認画面に進む"]');
  await page.waitForNavigation({
    waitUntil: ["load", "networkidle2"],
    timeout: 5000,
  });
  await page.screenshot({ path: `histories/${y}${m}${d}.png` });

  if (await page.$('input[value="申請"]')) {
    await page.click('input[value="申請"]');
    await page.waitForNavigation({
      waitUntil: ["load", "networkidle2"],
      timeout: 5000,
    });
    await page.screenshot({ path: `histories/${y}${m}${d}_done.png` });
  } else {
    // 申請ボタンが無い場合
    await page.screenshot({ path: `histories/${y}${m}${d}_failed.png` });
    console.log(`${y}${m}${d}の申請に失敗しました`);
  }
};

(async () => {
  const email =
    process.env.EMAIL ?? (await prompt("メールアドレスを入力してください"));
  const password =
    process.env.PASSWORD ?? (await prompt("パスワードを入力してください"));
  const browser = await puppeteer.launch({ headless });
  const page = await browser.newPage();
  // ログイン
  await page.goto(
    "https://id.jobcan.jp/users/sign_in?app_key=atd&redirect_to=https://ssl.jobcan.jp/jbcoauth/callback"
  );
  await page.type("#user_email", email);
  await page.type("#user_password", password);
  await page.click("input.form__login");
  await page.waitForNavigation({ waitUntil: ["load", "networkidle2"] });
  await page.screenshot({ path: "histories/login.png" });

  for (let holiday of holidays) {
    const [y, m, d] = holiday.map((num) => num.toString());
    await sendHoliday(y, m, d, page);
  }

  await browser.close();
})();
