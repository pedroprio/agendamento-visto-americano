import { getUnixTime } from "date-fns";
import puppeteer, { Browser } from "puppeteer";
import { CITIES, LOGIN, MONTHS } from "./constants";

export interface DateAvailable {
  year: string;
  month: string;
  date: string;
}

let browser: Browser;
const timeout = 3000;

const setup = {
  email: LOGIN.email,
  password: LOGIN.password,
  city: "Rio de Janeiro",
};

const selectors = {
  loginForm: {
    inputEmail: 'input[id="user_email"]',
    inputPassword: 'input[id="user_password"]',
    checkBoxPolicyConfirmed: 'input[id="policy_confirmed"]',
    submit: 'input[type="submit"]',
  },
  profilePage: {
    continueButton: "a.button.primary",
  },
  peopleSelection: {
    continueButton: 'input[type="submit"]',
  },  
  appointmentPage: {
    selectCity: 'select[id="appointments_consulate_appointment_facility_id"]',
    inputDate: 'input[id="appointments_consulate_appointment_date"]',
    datepicker: 'div[id="ui-datepicker-div"]',
    tableDatepicker: "table.ui-datepicker-calendar",
    nextMonthButton: 'div.ui-datepicker-group a[data-handler="next"]',
    datesAvailable: 'table.ui-datepicker-calendar td[data-handler="selectDay"]',
  },
};

(async () => {
  console.log(`Acessando página ...`);
  browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser'
  });

  //if (setup.email === DEFAULT.email || setup.password === DEFAULT.password) {
  //  console.error("Por favor, edite o email e senha");
  //  await browser.close();
  //  return;
 // }

  await bot();
  await browser.close();
})();

const bot = async (): Promise<void> => {
  const page = await browser.newPage();
  await page.goto("https://ais.usvisa-info.com/pt-br/niv/users/sign_in", {
    waitUntil: "load",
  });

  console.log(`Autenticando ...`);

  const inputEmail = await page.waitForSelector(selectors.loginForm.inputEmail);
  await inputEmail.type(setup.email);

  const inputPassword = await page.waitForSelector(
    selectors.loginForm.inputPassword
  );
  await inputPassword.type(setup.password);
  await page.click(selectors.loginForm.checkBoxPolicyConfirmed);

  try {
    console.log(`- Enviando formulário ...`);

    await Promise.all([
      page.click(selectors.loginForm.submit),
      page.waitForNavigation({
        waitUntil: "networkidle2",
        timeout: timeout,
      }),
    ]);
  } catch (e) {
    await handleError(
      e,
      page,
      "Não foi possível enviar o formulário. Tente novamente"
    );
    return;
  }

  console.log(`Página de perfil ...`);
  const continueButton = await page.waitForSelector(
    selectors.profilePage.continueButton
  );
  await Promise.all([
    continueButton.click(),
    page.waitForNavigation({
      waitUntil: "networkidle2",
      timeout: timeout,
    }),
  ]);

  console.log(`Redirecionando para a página de agendamento ...`);
  const urlAppointment = page.url().replace("continue_actions", "appointment");
  await page.goto(urlAppointment, {
    waitUntil: "load",
    timeout: timeout,
  });

  const continueButton2 = await page.waitForSelector(
    selectors.peopleSelection.continueButton
  );
  await Promise.all([
    continueButton2.click(),
    page.waitForNavigation({
      waitUntil: "networkidle2",
      timeout: timeout,
    }),
  ]);

  await printscreen(page, "-agendamento");

  try {
    const selectCity = await page.waitForSelector(
      selectors.appointmentPage.selectCity
    );
    selectCity.select(selectors.appointmentPage.selectCity, CITIES[setup.city]);
  } catch (e) {
    await handleError(
      e,
      page,
      "Error ao tentar carregar o form. Tente novamente"
    );
    return;
  }

  try {
    await printscreen(page, "-agendamento-2");

    await page.waitForTimeout(5000);

    const inputDate = await page.waitForSelector(
      selectors.appointmentPage.inputDate
    );
    await page.click(selectors.appointmentPage.inputDate);
  } catch (e) {
    await handleError(
      e,
      page,
      "Error ao tentar carregar o input de data. Tente novamente"
    );
    return;
  }

  await page.waitForSelector(selectors.appointmentPage.datepicker);
  await printscreen(page);
  let datesResults: DateAvailable[] = [];

  while (datesResults.length === 0) {
    let datesSelector = [];
    try {
      datesSelector = await page.evaluate(() => {
        const elements = document.querySelectorAll(
          'table.ui-datepicker-calendar td[data-handler="selectDay"]'
        );

        return Array.from(elements).map((element) => {
          return {
            month: element.attributes["data-month"].value,
            year: element.attributes["data-year"].value,
            //@ts-ignore
            date: element?.innerText,
          } as DateAvailable;
        }); // as you see, now this function returns array of texts instead of Array of elements
      });

      if (datesSelector.length > 0) {
        await printscreen(page, "-resultado");
      }
    } catch (e) {
      console.error(e.message);
      console.log(`- Próximo mês ...`);
      await page.click(selectors.appointmentPage.nextMonthButton);
      await printscreen(page);
      continue;
    }

    if (datesSelector.length === 0) {
      console.log(`- Próximo mês ...`);
      await page.click(selectors.appointmentPage.nextMonthButton);
      await printscreen(page);
    } else {
      datesResults = datesSelector;
    }
  }

  datesResults.map((results) => {
    console.log(
      "Datas disponíveis:",
      `${setup.city} - ${results.date}/${MONTHS[results.month]}/${results.year}`
    );
  });

  //Inicio teste de seleção de data
  const [priData] = await page.$x(selectors.appointmentPage.datesAvailable);
  if (priData) {
      await priData.click();
  }
  await page.setViewport({ width: 1920, height: 1080 });
  await printscreen(page);
  //Fim teste de seleção de data

  await page.close();
};

const printscreen = async (page: puppeteer.Page, alias = "") => {
  console.log(`- Printscreen ...`);
  await page.screenshot({
    path: `./screenshots/${getUnixTime(new Date())}${alias}.png`,
  });
};

const handleError = async (
  error: Error,
  page: puppeteer.Page,
  message = ""
) => {
  console.info(message);
  console.error(error.message);
  await page.close();
};
