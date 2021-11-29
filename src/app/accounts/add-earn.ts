import { getBalanceForWalletId, intraledgerPaymentSendWalletId } from "@app/wallets"
import { onboardingEarn } from "@config/app"
import {
  NoWalletExistsForUserError,
  RewardInsufficientBalanceError,
  RewardMissingMetadataError,
  RewardNonValidTypeError,
} from "@domain/errors"
import { getFunderWalletId } from "@services/ledger/accounts"
import { AccountsRepository, UsersRepository } from "@services/mongoose"
import { User } from "@services/mongoose/schema"

export const addEarn = async ({
  id,
  aid,
}: {
  id: QuizQuestionId
  aid: AccountId
}): Promise<true | ApplicationError> => {
  const user = await UsersRepository().findById(aid as unknown as UserId)
  if (user instanceof Error) return user

  if (!user.phoneMetadata || !user.phoneMetadata.carrier) {
    return new RewardMissingMetadataError()
  }

  if (user.phoneMetadata.carrier.type === "voip") {
    return new RewardNonValidTypeError()
  }

  const amount = onboardingEarn[id]
  const funderWalletId = await getFunderWalletId()

  const balanceFunder = await getBalanceForWalletId(funderWalletId)
  if (balanceFunder instanceof Error) return balanceFunder

  if (amount > balanceFunder) {
    return new RewardInsufficientBalanceError()
  }

  const recipientAccount = await AccountsRepository().findById(aid)
  if (recipientAccount instanceof Error) return recipientAccount

  if (!(recipientAccount.walletIds && recipientAccount.walletIds.length > 0)) {
    return new NoWalletExistsForUserError()
  }

  const recipientWalletId = recipientAccount.walletIds[0]

  // FIXME move to service
  const userPastState = await User.findOneAndUpdate(
    { _id: aid },
    { $push: { earn: id } },
    // { upsert: true },
  )

  if (userPastState.earn.findIndex((item) => item === id) === -1) {
    intraledgerPaymentSendWalletId({
      payerWalletId: funderWalletId,
      recipientWalletId,
      amount,
      memo,
      logger,
    })
  }

  // FIXME: use pay by username instead
  // const lnInvoice = await addInvoice({
  //   walletId: this.user.id,
  //   amount,
  //   memo: id,
  // })
  // if (lnInvoice instanceof Error) throw lnInvoice

  // const payResult = await lnInvoicePaymentSend({
  //   paymentRequest: lnInvoice.paymentRequest,
  //   memo: null,
  //   walletId: lightningFundingWallet.user.id,
  //   userId: lightningFundingWallet.user.id,
  //   logger: this.logger,
  // })
  // if (payResult instanceof Error) throw payResult
  return [{ id, value: amount, completed: true }]
}
