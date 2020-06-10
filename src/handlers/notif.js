import item_cache from '../cache'
import UserOrder from '../models/userSchema'
import { item_name } from '../utils'

const { NUMBER_EMOJI } = require('../../config.json')

/**
 * 
 * @param {import('discord.js').Message} message 
 * @param {*} args 
 */
const handler = async (message, args) => {
    const userID = message.author.id
    const options = 7

    const sorted_input = advise(args[0], options)

    if (sorted_input.length === 0) await message.author.send('Looks like the market is in flames...');

    const main = await message.author.send(advice_message(sorted_input))

    // Setup for the react
    for (let i = 0; i < options; i++) {
        await main.react(NUMBER_EMOJI[i])
    }

    await main.react('👍')

    const filter = (reaction, user) => {
        return NUMBER_EMOJI.includes(reaction.emoji.name) && user.id === userID
    }

    // Asks which orders he would like to invest in
    const reaction_array = []

    /**
     * @param {import('discord.js').Message} message 
     */
    async function awaitReaction(message) {
        const collected = await message.awaitReactions(filter, { max: 1, time: 60000, errors: ['time'] })
        const reaction = collected.first()

        if (reaction.emoji.name != '👍') {
            reaction_array.push(NUMBER_EMOJI.indexOf(reaction.emoji.name))
            return await awaitReaction(message)
        }
    }

    try {
        await awaitReaction(main)   
    } catch (error) {
        // ignore error
    }

    //Converts reaction to orderIDs
    const orders = []

    for (const i of reaction_array) {
        orders.push(sorted_input[i].name)
    }

    const member = await UserOrder.findOne({ user_id: message.author.id })

    if (!member) {
        // Create a new order for user
        const n_mem = new UserOrder({
            user_id: message.author.id,
            subscribed: false,
            orders: orders
        })
        await n_mem.save()
    } else if (member.orders.length > 0) {
        const new_message = await message.author.send('You already another investment pending, react with :thumbsup: to add these to the exiting investments or with :thumbsdown: to remove the old investments?')

        await new_message.react('👍')
        await new_message.react('👎')

        //Ask if he wants previous orders to be updated or cancelled
        const filter = (reaction, user) => ['👍', '👎'].includes(reaction.emoji.name) && user.id === userID

        let collected;
        try {
            collected = await new_message.awaitReactions(filter, { max: 1, time: 30000, errors: ['time'] })
            const reaction = collected.first()

            if (reaction.emoji.name != '👍') {
                // Update Previous
                for (let order of orders) {
                    if (!member.orders.includes(order.name)) {
                        member.orders.push(order)
                    }
                }
                await member.save()
            } else {
                //Cancel Previous
                member.orders = orders
                await member.save()
            }
        } catch (error) {
            // ignore error
        }
    } else {
        for (let order of orders) {
            if (!member.orders.includes(order.name)) {
                member.orders.push(order)
            }
        }
        await member.save()
    }
    message.author.send('Great! I\'ll notify you when you need to sell your investments.')
}

function limit(val, min, max) {
    return val < min ? min : (val > max ? max : val)
}

function advise(balance, options) {
    const unsorted = []
    for (const product_name in item_cache) {
        const product = item_cache[product_name]
        const profit = product.sell - product.buy

        const tvolume = Math.min(product.volume, product.svolume) / 2016
        const evolume = Math.floor(limit(tvolume, 0, balance / product.buy))

        const eprofit = (evolume * profit)

        unsorted.push({
            'name': product_name,
            'evolume': evolume,
            'invested': (product.buy * evolume).toFixed(2),
            'pinvested': (((product.buy * evolume) * 100) / balance).toFixed(1),
            'eprofit': eprofit.toFixed(2),
            'pprofit': ((profit / product.buy) * 100).toFixed(1)
        })

    }

    const sorted = unsorted.sort((a, b) => {
        return b.eprofit - a.eprofit
    })

    return sorted.filter(item => (item_cache[item.name].buy > item_cache[item.name].buy_ema) && (item_cache[item.name].sell > item_cache[item.name].sell_ema)).slice(0, options)
}

function advice_message(sorted_input) {
    const order_range = 7
    let final_message = ''
    for (const item of sorted_input) {
        final_message += `Item: **${item_name(item.name)}** _(${item.evolume})_\n`
        final_message += `Invested: **${item.invested}** _(${item.pinvested}%)_\n`
        final_message += `Minumum Profit: **${item.eprofit}** _(${item.pprofit}%)_\n\n`
    }
    return final_message += '_This data is updated every 30 seconds_'
}

export default handler
