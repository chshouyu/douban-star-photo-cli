import { Command, flags } from '@oclif/command';
import * as inquirer from 'inquirer';

class DoubanStarPhotoCli extends Command {
  static description = 'download douban star photos';

  static flags = {
    // add --version flag to show CLI version
    version: flags.version({ char: 'v' }),
    help: flags.help({ char: 'h' })
  };

  async run(): Promise<void> {
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
      },
      {
        name: 'path',
        message: 'input photos save path:',
        default: process.cwd(),
        validate: (input: string) => {
          if (!input) {
            return 'please input valid photos path';
          }
          return true;
        }
      }
    ]);

    // console.log(answers);
  }
}

export = DoubanStarPhotoCli;
