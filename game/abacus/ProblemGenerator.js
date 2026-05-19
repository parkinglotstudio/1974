/**
 * 주판왕 — ProblemGenerator
 * CustomerSystem의 손님 데이터를 받아 문제를 생성한다.
 *
 * 레벨 정의:
 *   1 입문 — 물건 1종 × 수량 (곱셈 → 합산)
 *   2 초급 — 물건 2종 합산
 *   3 중급 — 거스름돈 (지불 - 합계)
 *   4 고급 — 할인 합산 (10% 단위 반올림)
 */
export default class ProblemGenerator {
    /**
     * customer: CustomerSystem.generate()의 반환값
     * level: 1~4
     * 반환값: { answer, displayText, items, paid, level }
     */
    fromCustomer(customer, level) {
        const { items, total, paid } = customer;

        let answer;
        let displayText;

        if (level === 1) {
            // 물건 1종: qty × unitPrice
            const { name, qty, unitPrice } = items[0];
            answer = qty * unitPrice;
            displayText = `${name} ${qty}개 = ?원`;
        } else if (level === 2) {
            // 물건 2종 합산
            answer = total;
            displayText = items.map(i => `${i.name} ${i.qty}개(${i.unitPrice}원)`).join(' + ') + ' = ?원';
        } else if (level === 3) {
            // 거스름돈: paid - total
            answer = paid - total;
            displayText = `받은돈 ${paid}원 - 합계 ${total}원 = ?원`;
        } else {
            // 레벨4: 10% 할인 후 합계
            answer = Math.round(total * 0.9 / 10) * 10;
            displayText = `합계 ${total}원 (10%할인) = ?원`;
        }

        return { answer, displayText, items, paid, level, total };
    }
}
