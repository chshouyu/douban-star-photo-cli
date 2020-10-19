import path from 'path';
import { Command, flags } from '@oclif/command';
import inquirer from 'inquirer';
import fsx, { ReadStream, WriteStream } from 'fs-extra';
import axios from 'axios';
import cheerio from 'cheerio';
import chalk from 'chalk';
import cli from 'cli-ux';
import untildify from 'untildify';

class DoubanStarPhotoCli extends Command {
  static description = 'download douban star photos';

  static args = [
    {
      name: 'path',
      description: 'photos save path',
      parse: (input: string): string => {
        return path.isAbsolute(input) ? input : path.resolve(untildify(input));
      }
    }
  ];

  static flags = {
    // add --version flag to show CLI version
    version: flags.version({ char: 'v' }),
    help: flags.help({ char: 'h' })
  };

  async run(): Promise<void> {
    const {
      args: { path: photoSavePath }
    } = this.parse(DoubanStarPhotoCli);

    if (!photoSavePath) {
      return this._help();
    }

    if (fsx.existsSync(photoSavePath) && !fsx.statSync(photoSavePath).isDirectory()) {
      throw new Error(`\n${photoSavePath} is not a directory`);
    } else if (!fsx.existsSync(photoSavePath)) {
      fsx.ensureDirSync(photoSavePath);
    }

    const answers = await inquirer.prompt<{ code: string; path: string }>([
      {
        name: 'code',
        message: 'input star code:',
        validate: (input: string) => {
          if (!input || !/\d+/.test(input)) {
            return 'please input valid star code';
          }
          return true;
        }
      }
    ]);

    const { starName, photosCount, totalPages } = await this.getStarPhotosInfo(answers.code);

    console.log(`\nfind star name: ${chalk.green(starName)}`);
    console.log(`total photos count: ${chalk.green(photosCount)}`);
    console.log(`total photos pages: ${chalk.green(totalPages)}\n`);
    console.log(`The photos will save in:\n${photoSavePath}\n`);

    const progressBar = cli.progress({
      format: 'downloading... [{bar}] {percentage}% | ETA: {eta_formatted} | {value}/{total}'
    });

    progressBar.start(photosCount, 0);

    for (let i = 0; i < totalPages; i++) {
      const links = await this.getPhotoLinksFromEachPage(answers.code, i + 1);
      for (let j = 0; j < links.length; j++) {
        const link = links[j];
        try {
          const curr = i * 30 + j + 1;
          await this.downloadPhoto(link, photoSavePath);
          progressBar.update(curr);
        } catch (e) {
          console.error(chalk.red(e?.message));
        }
      }
    }

    progressBar.stop();
  }

  async getStarPhotosInfo(
    starId: string
  ): Promise<{ starName: string; photosCount: number; totalPages: number }> {
    const starHomePage = `https://movie.douban.com/celebrity/${starId}/photos`;
    const res = await axios.get(starHomePage, { responseType: 'text' });

    const $ = cheerio.load(res.data);
    const starName = $('#content h1').text().replace('的图片', '');
    const photosCountText = $('.count').text();

    const countMatch = photosCountText.match(/\d+/);

    if (!countMatch) {
      throw new Error('invalid photo count');
    }

    const totalPages = $('[data-total-page]').attr('data-total-page');

    return { starName, photosCount: Number(countMatch[0]), totalPages: Number(totalPages) };
  }

  async getPhotoLinksFromEachPage(starCode: string, pageNum: number): Promise<string[]> {
    const pageUrl = `https://movie.douban.com/celebrity/${starCode}/photos/?type=C&start=${
      (pageNum - 1) * 30
    }&sortby=like&size=a&subtype=a`;
    const res = await axios.get(pageUrl, { responseType: 'text' });

    const $ = cheerio.load(res.data);
    const links = $('.cover a')
      .map((_, item) => $(item).attr('href'))
      .get();

    return links;
  }

  async downloadPhoto(photoUrl: string, photoSavePath: string): Promise<void> {
    const res = await axios.get(photoUrl, { responseType: 'text' });

    const $ = cheerio.load(res.data);
    const imageUrl = $('.mainphoto img').attr('src');

    if (!imageUrl) {
      throw new Error('image not found');
    }

    const photoFileName = path.basename(imageUrl);
    const imageRes = await axios.get<ReadStream>(imageUrl, { responseType: 'stream' });
    const writer = fsx.createWriteStream(path.join(photoSavePath, photoFileName));

    await this.savePhotoFile(imageRes.data, writer);
  }

  savePhotoFile(readStream: ReadStream, writeStream: WriteStream): Promise<void> {
    return new Promise((resolve, reject) => {
      readStream.pipe(writeStream);

      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
  }
}

export = DoubanStarPhotoCli;
