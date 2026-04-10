import Kudo from '../models/kudo.mongo';

export async function computeKudoScores(
    startDate: number, endDate: number, rangeDays: number
): Promise<Map<string, number>> {
    const kudos = await Kudo.find({ createdAt: { $gte: startDate, $lte: endDate } }).toArray()

    const giverCounts = new Map<string, number>()
    for (const k of kudos) {
        giverCounts.set(k.fromUserId, (giverCounts.get(k.fromUserId) ?? 0) + 1)
    }

    const rawSums = new Map<string, number>()
    let rawPool = 0
    for (const k of kudos) {
        const n = giverCounts.get(k.fromUserId)!
        const value = 1 / Math.sqrt(n)
        rawPool += value
        rawSums.set(k.toUserId, (rawSums.get(k.toUserId) ?? 0) + value)
    }

    const A = Math.max(1, rangeDays)
    const scale = rawPool <= A ? 1 : A / rawPool

    const scores = new Map<string, number>()
    for (const [userId, rawSum] of rawSums) {
        scores.set(userId, rawSum * scale)
    }
    return scores
}
