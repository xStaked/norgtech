import { BadRequestException, Injectable } from "@nestjs/common";
import {
  EXPENSE_SUPPORT_ALLOWED_MIME_TYPES,
  EXPENSE_SUPPORT_MAX_BYTES,
} from "./commercial-expense-constants";
import {
  ExpenseExtractionInput,
  ExpenseExtractionProvider,
} from "./commercial-expense-extraction.provider";
import { ExtractCommercialExpenseSupportResult } from "./dto/extract-commercial-expense-support.dto";

type ExpenseSupportFile = Express.Multer.File;

@Injectable()
export class CommercialExpenseExtractionService {
  constructor(private readonly extractionProvider: ExpenseExtractionProvider) {}

  async extract(
    file?: ExpenseSupportFile,
  ): Promise<ExtractCommercialExpenseSupportResult> {
    const supportFile = this.assertSupportFile(file);
    const input: ExpenseExtractionInput = {
      fileName: supportFile.originalname,
      contentType: supportFile.mimetype,
      buffer: supportFile.buffer,
    };

    return this.extractionProvider.extract(input);
  }

  private assertSupportFile(file?: ExpenseSupportFile): ExpenseSupportFile {
    if (!file) {
      throw new BadRequestException("Expense support file is required");
    }

    if (
      !EXPENSE_SUPPORT_ALLOWED_MIME_TYPES.includes(
        file.mimetype as (typeof EXPENSE_SUPPORT_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      throw new BadRequestException("Unsupported expense support content type");
    }

    if (file.size > EXPENSE_SUPPORT_MAX_BYTES) {
      throw new BadRequestException("Expense support exceeds maximum size");
    }

    return file;
  }
}
